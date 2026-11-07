import type { TransactionType } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { descriptionKey, normalizeText } from '../../shared/utils/text';
import { FALLBACK_CATEGORY } from './categories.defaults';

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Sugere categoria por: 1) histórico do usuário (aprende com recategorizações),
 * 2) palavras-chave das categorias, 3) categoria padrão "Outros".
 */
export async function buildCategorizer(userId: string) {
  const [categories, history] = await Promise.all([
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true, type: true, keywords: true } }),
    prisma.transaction.findMany({
      where: { userId, categoryId: { not: null } },
      select: { description: true, categoryId: true, type: true },
      orderBy: { updatedAt: 'desc' },
      take: 3000,
    }),
  ]);

  const learned = new Map<string, string>();
  for (const h of history) {
    const key = `${h.type}|${descriptionKey(h.description)}`;
    if (key.length > 8 && !learned.has(key)) learned.set(key, h.categoryId!);
  }

  const rules = categories.map((c) => ({
    id: c.id,
    type: c.type,
    regexes: c.keywords
      .split(',')
      .filter(Boolean)
      .map((k) => new RegExp(`(^|[^a-z0-9])${escapeRx(k)}([^a-z0-9]|$)`)),
  }));

  const fallback = {
    EXPENSE: categories.find((c) => c.type === 'EXPENSE' && c.name === FALLBACK_CATEGORY.EXPENSE)?.id ?? null,
    INCOME: categories.find((c) => c.type === 'INCOME' && c.name === FALLBACK_CATEGORY.INCOME)?.id ?? null,
  };

  return (description: string, type: TransactionType): string | null => {
    const fromHistory = learned.get(`${type}|${descriptionKey(description)}`);
    if (fromHistory) return fromHistory;
    const text = normalizeText(description);
    const rule = rules.find((r) => r.type === type && r.regexes.some((rx) => rx.test(text)));
    return rule?.id ?? fallback[type];
  };
}
