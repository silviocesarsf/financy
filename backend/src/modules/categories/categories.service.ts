import type { z } from 'zod';
import type { TransactionType } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { notFound } from '../../shared/errors';
import { serializeCategory } from '../../shared/serializers';
import { normalizeText } from '../../shared/utils/text';
import { DEFAULT_CATEGORIES } from './categories.defaults';
import type { categorySchema } from './categories.schemas';

type CategoryInput = z.infer<typeof categorySchema>;

const toData = (input: CategoryInput) => ({
  ...input,
  keywords: [...new Set(input.keywords.map(normalizeText))].join(','),
  monthlyBudget: input.monthlyBudget ?? null,
});

export const categoriesService = {
  async seedDefaults(userId: string) {
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId, keywords: c.keywords.join(',') })),
      skipDuplicates: true,
    });
  },

  async list(userId: string, type?: TransactionType) {
    const items = await prisma.category.findMany({
      where: { userId, ...(type && { type }) },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return items.map(serializeCategory);
  },

  async create(userId: string, input: CategoryInput) {
    return serializeCategory(await prisma.category.create({ data: { ...toData(input), userId } }));
  },

  async update(userId: string, id: string, input: CategoryInput) {
    await this.ensureOwnership(userId, id);
    return serializeCategory(await prisma.category.update({ where: { id }, data: toData(input) }));
  },

  async remove(userId: string, id: string) {
    await this.ensureOwnership(userId, id);
    await prisma.category.delete({ where: { id } });
  },

  async ensureOwnership(userId: string, id: string) {
    const found = await prisma.category.findFirst({ where: { id, userId }, select: { id: true } });
    if (!found) throw notFound('Categoria');
  },
};
