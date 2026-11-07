import type { PaymentMethod } from './types';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export const brl = (n: number) => currency.format(n);
export const brlCompact = (n: number) => `R$ ${compact.format(n)}`;

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const monthShort = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]}/${String(y).slice(2)}`;
};
export const monthLong = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS_FULL[m - 1]} ${y}`;
};

export const dateBR = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
export const dateShort = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
};

const pad = (n: number) => String(n).padStart(2, '0');
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const currentMonth = () => todayISO().slice(0, 7);
export const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
};
export const monthBounds = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Débito',
  PIX: 'Pix',
  CASH: 'Dinheiro',
  BOLETO: 'Boleto',
  TRANSFER: 'Transferência',
  OTHER: 'Outro',
};

export const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  NUBANK_CARD_CSV: 'Nubank cartão',
  NUBANK_ACCOUNT_CSV: 'Nubank conta',
  NUBANK_PDF: 'Nubank PDF',
  OFX: 'OFX',
  RECURRING: 'Recorrente',
};

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
