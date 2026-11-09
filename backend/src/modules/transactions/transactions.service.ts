import type { Prisma, TransactionType } from '@prisma/client';
import type { z } from 'zod';
import { notBillPayment, prisma } from '../../shared/prisma';
import { AppError, notFound } from '../../shared/errors';
import { CATEGORY_SELECT, serializeTransaction } from '../../shared/serializers';
import { round2, toNumber } from '../../shared/utils/money';
import { monthEnd, monthStart, pad2, parseDateOnly, parseRef, refKey, toDateOnly, type MonthRef } from '../../shared/utils/date';
import { categoriesService } from '../categories/categories.service';
import { buildCategorizer } from '../categories/categorizer';
import { installmentProjection } from '../forecast/installments';
import type { bulkCategorySchema, invoicePaymentSchema, listQuerySchema, transactionSchema } from './transactions.schemas';

/** Pagamento de fatura idempotente por mês de competência. */
export const billFingerprint = (ref: MonthRef) => `bill:${refKey(ref)}`;

type TxInput = z.infer<typeof transactionSchema>;
type ListQuery = z.infer<typeof listQuerySchema>;

function buildWhere(userId: string, q: ListQuery): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };
  if (q.q) where.description = { contains: q.q };
  if (q.type) where.type = q.type;
  if (q.paymentMethod) where.paymentMethod = q.paymentMethod;
  if (q.categoryId) where.categoryId = q.categoryId === 'none' ? null : q.categoryId;
  if (q.from || q.to) {
    where.date = {
      ...(q.from && { gte: parseDateOnly(q.from) }),
      ...(q.to && { lte: parseDateOnly(q.to) }),
    };
  }
  return where;
}

/** Adiciona meses mantendo o dia (limitado ao último dia do mês). */
function addMonthsToDate(date: Date, n: number) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay)));
}

export const transactionsService = {
  async list(userId: string, q: ListQuery) {
    const where = buildWhere(userId, q);
    const [items, total, sums] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { category: { select: CATEGORY_SELECT } },
        orderBy: [{ [q.sort]: q.order }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.groupBy({ by: ['type'], where: { ...where, ...notBillPayment }, _sum: { amount: true } }), // totais sem pagamento de fatura
    ]);
    const sumOf = (t: TransactionType) => toNumber(sums.find((s) => s.type === t)?._sum.amount);
    return {
      items: items.map(serializeTransaction),
      total,
      page: q.page,
      pageSize: q.pageSize,
      totals: { income: sumOf('INCOME'), expense: sumOf('EXPENSE') },
    };
  },

  async get(userId: string, id: string) {
    const tx = await prisma.transaction.findFirst({
      where: { id, userId },
      include: { category: { select: CATEGORY_SELECT } },
    });
    if (!tx) throw notFound('Transação');
    return serializeTransaction(tx);
  },

  async create(userId: string, input: TxInput) {
    if (input.categoryId) await categoriesService.ensureOwnership(userId, input.categoryId);
    const base = {
      userId,
      type: input.type,
      categoryId: input.categoryId ?? null,
      paymentMethod: input.paymentMethod,
      notes: input.notes ?? null,
    };
    const date = parseDateOnly(input.date);

    if (!input.installments) {
      const tx = await prisma.transaction.create({
        data: { ...base, description: input.description, amount: input.amount, date },
        include: { category: { select: CATEGORY_SELECT } },
      });
      return [serializeTransaction(tx)];
    }

    const n = input.installments;
    const parcel = Math.floor((input.amount / n) * 100) / 100;
    const last = round2(input.amount - parcel * (n - 1));
    const created = await prisma.$transaction(
      Array.from({ length: n }, (_, i) =>
        prisma.transaction.create({
          data: {
            ...base,
            description: `${input.description} - Parcela ${i + 1}/${n}`,
            amount: i === n - 1 ? last : parcel,
            date: addMonthsToDate(date, i),
            installmentNumber: i + 1,
            installmentTotal: n,
          },
          include: { category: { select: CATEGORY_SELECT } },
        }),
      ),
    );
    return created.map(serializeTransaction);
  },

  async update(userId: string, id: string, input: TxInput) {
    await this.get(userId, id);
    if (input.categoryId) await categoriesService.ensureOwnership(userId, input.categoryId);
    const tx = await prisma.transaction.update({
      where: { id },
      data: {
        type: input.type,
        description: input.description,
        amount: input.amount,
        date: parseDateOnly(input.date),
        categoryId: input.categoryId ?? null,
        paymentMethod: input.paymentMethod,
        notes: input.notes ?? null,
      },
      include: { category: { select: CATEGORY_SELECT } },
    });
    return serializeTransaction(tx);
  },

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await prisma.transaction.delete({ where: { id } });
  },

  async bulkDelete(userId: string, ids: string[]) {
    const { count } = await prisma.transaction.deleteMany({ where: { userId, id: { in: ids } } });
    return { count };
  },

  async bulkCategory(userId: string, input: z.infer<typeof bulkCategorySchema>) {
    if (input.categoryId) await categoriesService.ensureOwnership(userId, input.categoryId);
    const { count } = await prisma.transaction.updateMany({
      where: { userId, id: { in: input.ids } },
      data: { categoryId: input.categoryId },
    });
    return { count };
  },

  async suggestCategory(userId: string, description: string, type: TransactionType) {
    const categorize = await buildCategorizer(userId);
    return { categoryId: categorize(description, type) };
  },

  /** Fatura do cartão no mês de competência: compras − créditos/estornos, parcelas previstas e pagamento. */
  async invoice(userId: string, ref: MonthRef) {
    const where = {
      userId,
      paymentMethod: 'CREDIT_CARD' as const,
      date: { gte: monthStart(ref), lt: monthEnd(ref) },
      ...notBillPayment,
    };
    const [sums, payment, projection] = await Promise.all([
      prisma.transaction.groupBy({ by: ['type'], where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.transaction.findUnique({ where: { userId_fingerprint: { userId, fingerprint: billFingerprint(ref) } } }),
      installmentProjection(userId, ref, ref),
    ]);
    const sumOf = (t: TransactionType) => toNumber(sums.find((s) => s.type === t)?._sum.amount);
    const expense = sumOf('EXPENSE');
    const credits = sumOf('INCOME');
    const projected = projection.byMonth.get(refKey(ref)) ?? 0;
    return {
      month: refKey(ref),
      items: sums.reduce((a, s) => a + s._count._all, 0),
      expense: round2(expense),
      credits: round2(credits),
      total: round2(expense - credits),
      /** parcelas previstas ainda não lançadas (fatura não importada) */
      projectedInstallments: round2(projected),
      payment: payment
        ? { id: payment.id, date: toDateOnly(payment.date), amount: toNumber(payment.amount), paymentMethod: payment.paymentMethod }
        : null,
    };
  },

  /** Registra o pagamento da fatura (um por mês). Fica fora dos totais: as compras já contam como despesa. */
  async payInvoice(userId: string, input: z.infer<typeof invoicePaymentSchema>) {
    const ref = parseRef(input.month);
    const fingerprint = billFingerprint(ref);
    const paid = await prisma.transaction.findUnique({ where: { userId_fingerprint: { userId, fingerprint } }, select: { id: true } });
    if (paid) throw new AppError(409, 'Esta fatura já foi paga');
    const tx = await prisma.transaction.create({
      data: {
        userId,
        type: 'EXPENSE',
        description: `Pagamento de fatura ${pad2(ref.month)}/${ref.year}`,
        amount: input.amount,
        date: parseDateOnly(input.date),
        paymentMethod: input.paymentMethod,
        fingerprint,
      },
      include: { category: { select: CATEGORY_SELECT } },
    });
    return serializeTransaction(tx);
  },
};
