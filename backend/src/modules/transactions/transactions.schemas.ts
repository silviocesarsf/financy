import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD');

export const paymentMethodEnum = z.enum(['CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'CASH', 'BOLETO', 'TRANSFER', 'OTHER']);
export const typeEnum = z.enum(['EXPENSE', 'INCOME']);

export const transactionSchema = z.object({
  type: typeEnum,
  description: z.string().trim().min(1).max(255),
  amount: z.number().positive().max(100_000_000),
  date: dateOnly,
  categoryId: z.string().nullable().optional(),
  paymentMethod: paymentMethodEnum.default('OTHER'),
  notes: z.string().trim().max(500).nullable().optional(),
  /** Apenas na criação: divide o valor total em N parcelas mensais. */
  installments: z.number().int().min(2).max(48).optional(),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  categoryId: z.string().optional(),
  type: typeEnum.optional(),
  paymentMethod: paymentMethodEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['date', 'amount', 'description']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1).max(500) });

export const bulkCategorySchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  categoryId: z.string().nullable(),
});
