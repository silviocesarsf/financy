import type { PaymentMethod, TransactionSource, TransactionType } from '@prisma/client';
import { AppError } from '../../shared/errors';
import { parseAmount } from '../../shared/utils/money';
import { normalizeText, extractInstallment } from '../../shared/utils/text';
import { addMonths, pad2, parseDateOnly, refKey, refOf } from '../../shared/utils/date';

export interface ParsedItem {
  date: string; // AAAA-MM-DD
  description: string;
  amount: number; // sempre positivo
  type: TransactionType;
  paymentMethod: PaymentMethod;
  installmentNumber: number | null;
  installmentTotal: number | null;
  /** Sugestão de importação (ex.: pagamento de fatura vem desmarcado). */
  selected: boolean;
}

export interface ParseResult {
  source: TransactionSource;
  label: string;
  items: ParsedItem[];
  /** Fatura de cartão: itens contam no mês do vencimento (dueDate), não na data da compra. */
  isCardInvoice?: boolean;
  dueDate?: string | null;
  /** Mês de competência da fatura (AAAA-MM): mês das compras, anterior ao vencimento. */
  refMonth?: string | null;
}

/** Nubank nomeia a fatura como "Nubank_AAAA-MM-DD.csv" (data de vencimento). */
const dueDateFromFileName = (fileName: string) => fileName.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

const latestDate = (items: ParsedItem[]) => items.reduce<string | null>((max, i) => (!max || i.date > max ? i.date : max), null);

// ---------- CSV ----------

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function readCsv(text: string) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new AppError(400, 'Arquivo CSV vazio');
  const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitCsvLine(lines[0], delimiter).map(normalizeText);
  const rows = lines.slice(1).map((l) => splitCsvLine(l, delimiter));
  return { header, rows };
}

const brDateToIso = (s: string) => {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new AppError(400, `Data inválida no arquivo: ${s}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
};

const withInstallment = (description: string) => {
  const inst = extractInstallment(description);
  return { installmentNumber: inst?.number ?? null, installmentTotal: inst?.total ?? null };
};

function detectMethod(description: string, fallback: PaymentMethod): PaymentMethod {
  const d = normalizeText(description);
  if (d.includes('pix')) return 'PIX';
  if (d.includes('debito')) return 'DEBIT_CARD';
  if (d.includes('boleto')) return 'BOLETO';
  if (d.includes('transferencia') || d.includes('ted') || d.includes('doc ')) return 'TRANSFER';
  return fallback;
}

/** Fatura do cartão Nubank (CSV): date,title,amount */
function parseNubankCard(rows: string[][], header: string[]): ParsedItem[] {
  const iDate = header.indexOf('date');
  const iTitle = header.indexOf('title');
  const iAmount = header.indexOf('amount');
  return rows
    .filter((r) => r[iDate] && r[iAmount])
    .flatMap<ParsedItem>((r) => {
      const description = r[iTitle];
      const value = parseAmount(r[iAmount]);
      const d = normalizeText(description);
      if (value < 0 && d.includes('pagamento')) return []; // pagamento da fatura não é receita
      return [
        {
          date: r[iDate].slice(0, 10),
          description,
          amount: Math.abs(value),
          type: value < 0 ? 'INCOME' : 'EXPENSE',
          paymentMethod: 'CREDIT_CARD',
          ...withInstallment(description),
          selected: value > 0, // estornos/créditos vêm desmarcados
        },
      ];
    });
}

/** Extrato da conta Nubank (CSV): Data,Valor,Identificador,Descrição */
function parseNubankAccount(rows: string[][], header: string[]): ParsedItem[] {
  const iDate = header.indexOf('data');
  const iValue = header.indexOf('valor');
  const iDesc = header.findIndex((h) => h.startsWith('descri'));
  return rows
    .filter((r) => r[iDate] && r[iValue])
    .map((r) => {
      const raw = r[iDesc] ?? '';
      const parts = raw.split(' - ');
      const description = (parts.length > 2 ? parts.slice(0, 2).join(' - ') : raw).trim();
      const value = parseAmount(r[iValue]);
      const d = normalizeText(raw);
      const internal =
        d.includes('pagamento de fatura') ||
        d.includes('aplicacao rdb') ||
        d.includes('resgate rdb') ||
        d.includes('dinheiro guardado') ||
        d.includes('dinheiro resgatado');
      return {
        date: brDateToIso(r[iDate]),
        description,
        amount: Math.abs(value),
        type: value < 0 ? 'EXPENSE' : 'INCOME',
        paymentMethod: detectMethod(raw, 'OTHER'),
        installmentNumber: null,
        installmentTotal: null,
        selected: !internal, // movimentações internas vêm desmarcadas
      } satisfies ParsedItem;
    });
}

// ---------- OFX ----------

function parseOfx(text: string): ParseResult {
  const isCard = /<CREDITCARDMSGSRSV1>/i.test(text);
  const blocks = text.match(/<STMTTRN>[\s\S]*?(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi) ?? [];
  const tag = (b: string, t: string) => b.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? '';
  const items = blocks.flatMap<ParsedItem>((b) => {
    const dt = tag(b, 'DTPOSTED');
    const value = parseAmount(tag(b, 'TRNAMT') || '0');
    const description = tag(b, 'MEMO') || tag(b, 'NAME') || 'Sem descrição';
    if (!dt || value === 0) return [];
    const d = normalizeText(description);
    if (isCard && value > 0 && d.includes('pagamento')) return [];
    return [
      {
        date: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`,
        description,
        amount: Math.abs(value),
        type: value < 0 ? 'EXPENSE' : 'INCOME',
        paymentMethod: isCard ? 'CREDIT_CARD' : detectMethod(description, 'OTHER'),
        ...withInstallment(description),
        selected: isCard ? value < 0 : !d.includes('pagamento de fatura'),
      },
    ];
  });
  return { source: 'OFX', label: isCard ? 'OFX – cartão de crédito' : 'OFX – conta', items, isCardInvoice: isCard };
}

// ---------- PDF (fatura Nubank, melhor esforço) ----------

const MONTHS: Record<string, number> = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

async function parseNubankPdf(buffer: Buffer): Promise<ParseResult> {
  // import direto evita o modo debug do pdf-parse ao carregar o index
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdf = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text: string }>;
  const { text } = await pdf(buffer);

  const due = text.match(/vencimento[^\d]{0,20}(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i);
  const dueMonth = due ? MONTHS[due[2].toUpperCase()] : new Date().getMonth() + 1;
  const dueYear = due ? Number(due[3]) : new Date().getFullYear();

  const rx = /^(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+(-?\s?(?:R\$\s?)?-?[\d.]+,\d{2})$/i;
  const items: ParsedItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const m = rawLine.trim().match(rx);
    if (!m) continue;
    const month = MONTHS[m[2].toUpperCase()];
    const year = month > dueMonth ? dueYear - 1 : dueYear;
    const description = m[3].replace(/•+\s*\d{4}/g, '').replace(/\s+/g, ' ').trim();
    const value = parseAmount(m[4]);
    const d = normalizeText(description);
    if (d.includes('pagamento em') || d.includes('pagamento recebido') || d.startsWith('saldo')) continue;
    items.push({
      date: `${year}-${pad2(month)}-${m[1]}`,
      description,
      amount: Math.abs(value),
      type: value < 0 ? 'INCOME' : 'EXPENSE',
      paymentMethod: 'CREDIT_CARD',
      ...withInstallment(description),
      selected: value > 0,
    });
  }
  if (!items.length) {
    throw new AppError(
      400,
      'Não foi possível ler lançamentos deste PDF. Exporte a fatura em CSV ou OFX pelo app/site do Nubank.',
    );
  }
  return {
    source: 'NUBANK_PDF',
    label: 'Fatura Nubank (PDF)',
    items,
    isCardInvoice: true,
    dueDate: due ? `${dueYear}-${pad2(dueMonth)}-${due[1]}` : null,
  };
}

// ---------- Detecção ----------

export async function parseStatement(fileName: string, buffer: Buffer): Promise<ParseResult> {
  const result = await parseByFormat(fileName, buffer);
  if (result.isCardInvoice) {
    const due = result.dueDate ?? dueDateFromFileName(fileName);
    result.dueDate = due ?? latestDate(result.items);
    // vencimento em dez = compras de nov; sem vencimento conhecido, usa o mês da última compra
    result.refMonth = due ? refKey(addMonths(refOf(parseDateOnly(due)), -1)) : (result.dueDate?.slice(0, 7) ?? null);
  }
  return result;
}

async function parseByFormat(fileName: string, buffer: Buffer): Promise<ParseResult> {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'pdf') return parseNubankPdf(buffer);

  const text = buffer.toString('utf8');
  if (ext === 'ofx' || /<OFX>/i.test(text)) return parseOfx(text);

  const { header, rows } = readCsv(text);
  if (header.includes('date') && header.includes('title') && header.includes('amount')) {
    return {
      source: 'NUBANK_CARD_CSV',
      label: 'Fatura do cartão Nubank (CSV)',
      items: parseNubankCard(rows, header),
      isCardInvoice: true,
    };
  }
  if (header.includes('data') && header.includes('valor') && header.some((h) => h.startsWith('descri'))) {
    return { source: 'NUBANK_ACCOUNT_CSV', label: 'Extrato da conta Nubank (CSV)', items: parseNubankAccount(rows, header) };
  }
  throw new AppError(400, 'Formato não reconhecido. Envie a fatura/extrato do Nubank em CSV, OFX ou PDF.');
}
