import type { Prisma, TransactionType } from '@prisma/client';
import { notBillPayment, notBillPaymentSql, prisma } from '../../shared/prisma';
import { CATEGORY_SELECT, serializeTransaction } from '../../shared/serializers';
import { round2, toNumber } from '../../shared/utils/money';
import {
  addMonths,
  daysInMonth,
  monthEnd,
  monthStart,
  refKey,
  type MonthRef,
} from '../../shared/utils/date';
import { isActiveIn } from '../recurring/recurring.service';
import { installmentProjection } from '../forecast/installments';

interface MonthlyRow {
  ym: string;
  type: TransactionType;
  total: Prisma.Decimal;
}

/** Totais por mês/tipo num intervalo (uma única query agregada). */
export async function monthlyTotals(userId: string, from: Date, to: Date) {
  const rows = await prisma.$queryRaw<MonthlyRow[]>`
    SELECT DATE_FORMAT(date, '%Y-%m') AS ym, type, SUM(amount) AS total
    FROM transactions
    WHERE userId = ${userId} AND date >= ${from} AND date < ${to}
      AND ${notBillPaymentSql} -- pagamento de fatura fora dos totais
    GROUP BY ym, type`;
  const map = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const entry = map.get(r.ym) ?? { income: 0, expense: 0 };
    entry[r.type === 'INCOME' ? 'income' : 'expense'] += toNumber(r.total);
    map.set(r.ym, entry);
  }
  return map;
}

/** Renda esperada e compromissos fixos de um mês (salário do perfil + recorrências). */
export async function commitments(userId: string, ref: MonthRef) {
  const [user, recurrings, installments, projection] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { monthlyIncome: true } }),
    prisma.recurring.findMany({ where: { userId, active: true } }),
    prisma.transaction.aggregate({
      where: {
        userId,
        type: 'EXPENSE',
        installmentTotal: { gt: 1 },
        date: { gte: monthStart(ref), lt: monthEnd(ref) },
      },
      _sum: { amount: true },
    }),
    installmentProjection(userId, ref, ref),
  ]);
  const active = recurrings.filter((r) => isActiveIn(r, ref));
  const sum = (t: TransactionType) =>
    active.filter((r) => r.type === t).reduce((acc, r) => acc + toNumber(r.amount), 0);
  const launched = toNumber(installments._sum.amount);
  const projected = projection.byMonth.get(refKey(ref)) ?? 0;
  return {
    expectedIncome: round2(toNumber(user.monthlyIncome) + sum('INCOME')),
    fixed: round2(sum('EXPENSE')),
    /** parcelas já lançadas no mês + parcelas previstas (ainda não importadas) */
    installments: round2(launched + projected),
    installmentsProjected: round2(projected),
  };
}

const pct = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);

export const dashboardService = {
  async overview(userId: string, ref: MonthRef) {
    const start = monthStart(ref);
    const end = monthEnd(ref);
    const where = { userId, date: { gte: start, lt: end } };
    // Pagamento de fatura fora dos totais
    const totalsWhere = { ...where, ...notBillPayment };

    const [trend, commit, byCat, daily, recent, categories] = await Promise.all([
      monthlyTotals(userId, monthStart(addMonths(ref, -5)), end),
      commitments(userId, ref),
      prisma.transaction.groupBy({ by: ['categoryId'], where: { ...totalsWhere, type: 'EXPENSE' }, _sum: { amount: true } }),
      prisma.transaction.groupBy({ by: ['date'], where: { ...totalsWhere, type: 'EXPENSE' }, _sum: { amount: true } }),
      prisma.transaction.findMany({
        where,
        include: { category: { select: CATEGORY_SELECT } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 6,
      }),
      prisma.category.findMany({ where: { userId } }),
    ]);

    const current = trend.get(refKey(ref)) ?? { income: 0, expense: 0 };
    const previous = trend.get(refKey(addMonths(ref, -1))) ?? { income: 0, expense: 0 };
    const incomeBase = Math.max(commit.expectedIncome, current.income);
    const committedTotal = commit.fixed + commit.installments;

    const catMap = new Map(categories.map((c) => [c.id, c]));
    const byCategory = byCat
      .map((g) => {
        const c = g.categoryId ? catMap.get(g.categoryId) : undefined;
        const total = toNumber(g._sum.amount);
        const budget = c?.monthlyBudget ? toNumber(c.monthlyBudget) : null;
        return {
          categoryId: g.categoryId,
          name: c?.name ?? 'Sem categoria',
          color: c?.color ?? '#94a3b8',
          icon: c?.icon ?? 'circle-dashed',
          total,
          share: pct(total, current.expense),
          budget,
          budgetPct: budget ? pct(total, budget) : null,
        };
      })
      .sort((a, b) => b.total - a.total);

    // categorias com orçamento e sem gasto também aparecem nos orçamentos
    const budgets = categories
      .filter((c) => c.monthlyBudget && c.type === 'EXPENSE')
      .map((c) => {
        const spent = byCategory.find((b) => b.categoryId === c.id)?.total ?? 0;
        const budget = toNumber(c.monthlyBudget);
        return { categoryId: c.id, name: c.name, color: c.color, icon: c.icon, spent, budget, pct: pct(spent, budget) };
      })
      .sort((a, b) => b.pct - a.pct);

    const dailyMap = new Map(daily.map((d) => [d.date.getUTCDate(), toNumber(d._sum.amount)]));
    let cumulative = 0;
    const dailySeries = Array.from({ length: daysInMonth(ref) }, (_, i) => {
      const total = dailyMap.get(i + 1) ?? 0;
      cumulative += total;
      return { day: i + 1, total: round2(total), cumulative: round2(cumulative) };
    });

    return {
      month: refKey(ref),
      summary: {
        income: round2(current.income),
        expense: round2(current.expense),
        balance: round2(current.income - current.expense),
        previousExpense: round2(previous.expense),
        expenseChangePct: previous.expense > 0 ? pct(current.expense - previous.expense, previous.expense) : null,
      },
      committed: {
        incomeBase: round2(incomeBase),
        expectedIncome: commit.expectedIncome,
        fixed: commit.fixed,
        installments: commit.installments,
        installmentsProjected: commit.installmentsProjected,
        total: round2(committedTotal),
        pct: pct(committedTotal, incomeBase),
        spentPct: pct(current.expense, incomeBase),
        // desconta também as parcelas previstas que ainda não foram importadas no mês
        available: round2(incomeBase - current.expense - commit.installmentsProjected),
      },
      byCategory,
      budgets,
      daily: dailySeries,
      trend: Array.from({ length: 6 }, (_, i) => {
        const key = refKey(addMonths(ref, i - 5));
        const t = trend.get(key) ?? { income: 0, expense: 0 };
        return { month: key, income: round2(t.income), expense: round2(t.expense) };
      }),
      recent: recent.map(serializeTransaction),
    };
  },
};
