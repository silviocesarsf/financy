import type { Category, Transaction } from '@prisma/client';
import { toNumber } from './utils/money';
import { toDateOnly } from './utils/date';

type TxWithCategory = Transaction & { category?: Pick<Category, 'id' | 'name' | 'color' | 'icon'> | null };

export const serializeTransaction = (t: TxWithCategory) => ({
  id: t.id,
  type: t.type,
  description: t.description,
  amount: toNumber(t.amount),
  date: toDateOnly(t.date),
  purchaseDate: t.purchaseDate ? toDateOnly(t.purchaseDate) : null,
  paymentMethod: t.paymentMethod,
  source: t.source,
  installmentNumber: t.installmentNumber,
  installmentTotal: t.installmentTotal,
  notes: t.notes,
  categoryId: t.categoryId,
  category: t.category ?? null,
  importBatchId: t.importBatchId,
});

export const serializeCategory = (c: Category) => ({
  id: c.id,
  name: c.name,
  color: c.color,
  icon: c.icon,
  type: c.type,
  keywords: c.keywords ? c.keywords.split(',').filter(Boolean) : [],
  monthlyBudget: c.monthlyBudget == null ? null : toNumber(c.monthlyBudget),
});

export const CATEGORY_SELECT = { id: true, name: true, color: true, icon: true } as const;
