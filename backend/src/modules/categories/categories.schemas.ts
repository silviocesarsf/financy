import { z } from 'zod';

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1).max(40),
  type: z.enum(['EXPENSE', 'INCOME']),
  keywords: z.array(z.string().trim().min(1).max(60)).max(80).default([]),
  monthlyBudget: z.number().positive().nullable().optional(),
});
