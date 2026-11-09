import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../shared/prisma';
import { notFound } from '../../shared/errors';
import { daysInMonth, parseDateOnly, parseRef } from '../../shared/utils/date';
import { descriptionKey } from '../../shared/utils/text';
import { buildCategorizer } from '../categories/categorizer';
import { paymentMethodEnum, typeEnum } from '../transactions/transactions.schemas';
import { parseStatement } from './parsers';

export const confirmSchema = z.object({
  fileName: z.string().min(1).max(255),
  source: z.enum(['NUBANK_CARD_CSV', 'NUBANK_ACCOUNT_CSV', 'NUBANK_PDF', 'OFX']),
  /** Vencimento da fatura: quando informado, todos os itens contam neste mês (competência da fatura). */
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** Mês de competência da fatura (AAAA-MM); tem prioridade sobre o mês do vencimento. */
  refMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
  items: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().trim().min(1).max(255),
        amount: z.number().positive(),
        type: typeEnum,
        paymentMethod: paymentMethodEnum,
        categoryId: z.string().nullable(),
        installmentNumber: z.number().int().nullable(),
        installmentTotal: z.number().int().nullable(),
        fingerprint: z.string().max(80),
      }),
    )
    .min(1)
    .max(2000),
});

/** Data de competência: dia do vencimento (limitado ao fim do mês) dentro do mês da fatura. */
function competenceDate(refMonth: string, dueDate: Date | null) {
  const ref = parseRef(refMonth);
  const day = Math.min(dueDate?.getUTCDate() ?? 1, daysInMonth(ref));
  return new Date(Date.UTC(ref.year, ref.month - 1, day));
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 40);

export const importsService = {
  /** Lê o arquivo e devolve uma prévia categorizada, marcando duplicados. Nada é gravado. */
  async preview(userId: string, fileName: string, buffer: Buffer) {
    const parsed = await parseStatement(fileName, buffer);
    const categorize = await buildCategorizer(userId);

    const seen = new Map<string, number>();
    const items = parsed.items.map((item) => {
      const base = `${item.date}|${item.type}|${item.amount.toFixed(2)}|${descriptionKey(item.description)}`;
      const occurrence = (seen.get(base) ?? 0) + 1; // compras idênticas no mesmo dia
      seen.set(base, occurrence);
      return {
        ...item,
        fingerprint: `imp:${hash(`${userId}|${base}|${occurrence}`)}`,
        categoryId: categorize(item.description, item.type),
      };
    });

    const existing = await prisma.transaction.findMany({
      where: { userId, fingerprint: { in: items.map((i) => i.fingerprint) } },
      select: { fingerprint: true },
    });
    const dup = new Set(existing.map((e) => e.fingerprint));

    return {
      fileName,
      source: parsed.source,
      label: parsed.label,
      isCardInvoice: !!parsed.isCardInvoice,
      dueDate: parsed.dueDate ?? null,
      refMonth: parsed.refMonth ?? null,
      items: items.map((i) => ({ ...i, duplicate: dup.has(i.fingerprint), selected: i.selected && !dup.has(i.fingerprint) })),
    };
  },

  async confirm(userId: string, input: z.infer<typeof confirmSchema>) {
    const categoryIds = [...new Set(input.items.map((i) => i.categoryId).filter(Boolean))] as string[];
    const owned = await prisma.category.findMany({ where: { userId, id: { in: categoryIds } }, select: { id: true } });
    const ownedSet = new Set(owned.map((c) => c.id));

    const dueDate = input.dueDate ? parseDateOnly(input.dueDate) : null;
    const competence = input.refMonth ? competenceDate(input.refMonth, dueDate) : dueDate;

    return prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: { userId, fileName: input.fileName, source: input.source, totalItems: 0 },
      });
      const { count } = await tx.transaction.createMany({
        data: input.items.map((i) => ({
          userId,
          importBatchId: batch.id,
          source: input.source,
          type: i.type,
          description: i.description,
          amount: i.amount,
          date: competence ?? parseDateOnly(i.date),
          purchaseDate: competence ? parseDateOnly(i.date) : null,
          paymentMethod: i.paymentMethod,
          categoryId: i.categoryId && ownedSet.has(i.categoryId) ? i.categoryId : null,
          installmentNumber: i.installmentNumber,
          installmentTotal: i.installmentTotal,
          fingerprint: i.fingerprint,
        })),
        skipDuplicates: true,
      });
      await tx.importBatch.update({ where: { id: batch.id }, data: { totalItems: count } });
      return { batchId: batch.id, imported: count, skipped: input.items.length - count };
    });
  },

  async list(userId: string) {
    return prisma.importBatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, fileName: true, source: true, totalItems: true, createdAt: true },
    });
  },

  /** Desfaz uma importação (cascade remove as transações do lote). */
  async remove(userId: string, id: string) {
    const batch = await prisma.importBatch.findFirst({ where: { id, userId }, select: { id: true } });
    if (!batch) throw notFound('Importação');
    await prisma.importBatch.delete({ where: { id } });
  },
};
