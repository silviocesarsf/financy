import { prisma } from '../../shared/prisma';
import { toNumber } from '../../shared/utils/money';
import { addMonths, monthDiff, monthEnd, monthStart, refKey, refOf, type MonthRef } from '../../shared/utils/date';
import { descriptionKey, extractInstallment } from '../../shared/utils/text';

export interface OpenInstallment {
  description: string;
  amount: number;
  /** Mês da última parcela */
  endMonth: string;
  /** Mês da última parcela conhecida (lançada) */
  lastKnownMonth: string;
}

/**
 * Projeta parcelas ainda NÃO lançadas a partir da última parcela conhecida de cada compra.
 * Ex.: "Loja - Parcela 7/12" na fatura de nov → projeta 8/12 em dez ... 12/12 em abr.
 * A compra é identificada por descrição + total de parcelas + mês da 1ª parcela, o que mantém
 * a mesma compra agrupada entre faturas mesmo que o valor da última parcela varie em centavos.
 */
export async function installmentProjection(userId: string, from: MonthRef, to: MonthRef) {
  const [known, lastInvoice] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        type: 'EXPENSE',
        installmentTotal: { gt: 1 },
        installmentNumber: { not: null },
        date: { gte: monthStart(addMonths(from, -48)), lt: monthEnd(to) },
      },
      select: { description: true, amount: true, date: true, installmentNumber: true, installmentTotal: true, importBatchId: true },
    }),
    // última fatura de cartão importada
    prisma.transaction.findFirst({
      where: { userId, paymentMethod: 'CREDIT_CARD', importBatchId: { not: null } },
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
  ]);
  const lastInvoiceRef = lastInvoice ? refOf(lastInvoice.date) : null;

  const latest = new Map<string, (typeof known)[number]>();
  for (const t of known) {
    const firstMonth = refKey(addMonths(refOf(t.date), -(t.installmentNumber! - 1)));
    const key = `${descriptionKey(t.description)}|${t.installmentTotal}|${firstMonth}`;
    const prev = latest.get(key);
    if (!prev || t.installmentNumber! > prev.installmentNumber!) latest.set(key, t);
  }

  const byMonth = new Map<string, number>();
  const open: OpenInstallment[] = [];
  for (const t of latest.values()) {
    // parcela importada que não veio numa fatura mais recente: compra estornada ou quitada antecipadamente
    if (t.importBatchId && lastInvoiceRef && monthDiff(refOf(t.date), lastInvoiceRef) > 0) continue;
    const amount = toNumber(t.amount);
    const lastRef = refOf(t.date);
    const remaining = t.installmentTotal! - t.installmentNumber!;
    for (let j = 1; j <= remaining; j++) {
      const ref = addMonths(lastRef, j);
      if (monthDiff(from, ref) >= 0 && monthDiff(ref, to) >= 0) {
        byMonth.set(refKey(ref), (byMonth.get(refKey(ref)) ?? 0) + amount);
      }
    }
    open.push({
      description: extractInstallment(t.description)?.base ?? t.description,
      amount,
      endMonth: refKey(addMonths(lastRef, remaining)),
      lastKnownMonth: refKey(lastRef),
    });
  }
  return { byMonth, open };
}
