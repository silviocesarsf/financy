import type { Recurring } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../shared/prisma';
import { AppError, notFound } from '../../shared/errors';
import { CATEGORY_SELECT } from '../../shared/serializers';
import { toNumber } from '../../shared/utils/money';
import {
  currentRef,
  daysInMonth,
  monthEnd,
  monthStart,
  parseDateOnly,
  refKey,
  toDateOnly,
  type MonthRef,
} from '../../shared/utils/date';
import { paymentMethodEnum, typeEnum } from '../transactions/transactions.schemas';
import { categoriesService } from '../categories/categories.service';

export const recurringSchema = z.object({
  type: typeEnum,
  description: z.string().trim().min(1).max(255),
  amount: z.number().positive().max(100_000_000),
  dayOfMonth: z.number().int().min(1).max(31),
  categoryId: z.string().nullable().optional(),
  paymentMethod: paymentMethodEnum.default('OTHER'),
  active: z.boolean().default(true),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

type RecurringInput = z.infer<typeof recurringSchema>;

const fingerprintOf = (id: string, ref: MonthRef) => `rec:${id}:${refKey(ref)}`;

/** Recorrência válida no mês informado. */
export const isActiveIn = (r: Pick<Recurring, 'active' | 'startDate' | 'endDate'>, ref: MonthRef) =>
  r.active && r.startDate < monthEnd(ref) && (!r.endDate || r.endDate >= monthStart(ref));

const toData = (input: RecurringInput) => ({
  ...input,
  categoryId: input.categoryId ?? null,
  startDate: parseDateOnly(input.startDate),
  endDate: input.endDate ? parseDateOnly(input.endDate) : null,
});

export const recurringService = {
  async list(userId: string) {
    const ref = currentRef();
    const items = await prisma.recurring.findMany({
      where: { userId },
      include: { category: { select: CATEGORY_SELECT } },
      orderBy: [{ active: 'desc' }, { dayOfMonth: 'asc' }],
    });
    const launched = await prisma.transaction.findMany({
      where: { userId, fingerprint: { in: items.map((i) => fingerprintOf(i.id, ref)) } },
      select: { fingerprint: true },
    });
    const launchedSet = new Set(launched.map((l) => l.fingerprint));
    return items.map((r) => ({
      id: r.id,
      type: r.type,
      description: r.description,
      amount: toNumber(r.amount),
      dayOfMonth: r.dayOfMonth,
      categoryId: r.categoryId,
      category: r.category,
      paymentMethod: r.paymentMethod,
      active: r.active,
      startDate: toDateOnly(r.startDate),
      endDate: r.endDate ? toDateOnly(r.endDate) : null,
      activeThisMonth: isActiveIn(r, ref),
      launchedThisMonth: launchedSet.has(fingerprintOf(r.id, ref)),
    }));
  },

  async create(userId: string, input: RecurringInput) {
    if (input.categoryId) await categoriesService.ensureOwnership(userId, input.categoryId);
    return prisma.recurring.create({ data: { ...toData(input), userId } });
  },

  async update(userId: string, id: string, input: RecurringInput) {
    await this.find(userId, id);
    if (input.categoryId) await categoriesService.ensureOwnership(userId, input.categoryId);
    return prisma.recurring.update({ where: { id }, data: toData(input) });
  },

  async remove(userId: string, id: string) {
    await this.find(userId, id);
    await prisma.recurring.delete({ where: { id } });
  },

  /** Lança a recorrência como transação do mês atual (idempotente via fingerprint). */
  async launch(userId: string, id: string) {
    const r = await this.find(userId, id);
    const ref = currentRef();
    if (!isActiveIn(r, ref)) throw new AppError(400, 'Recorrência não está ativa neste mês');
    const day = Math.min(r.dayOfMonth, daysInMonth(ref));
    await prisma.transaction.create({
      data: {
        userId,
        type: r.type,
        description: r.description,
        amount: r.amount,
        date: new Date(Date.UTC(ref.year, ref.month - 1, day)),
        categoryId: r.categoryId,
        paymentMethod: r.paymentMethod,
        source: 'RECURRING',
        fingerprint: fingerprintOf(r.id, ref),
      },
    });
  },

  async find(userId: string, id: string) {
    const r = await prisma.recurring.findFirst({ where: { id, userId } });
    if (!r) throw notFound('Recorrência');
    return r;
  },
};
