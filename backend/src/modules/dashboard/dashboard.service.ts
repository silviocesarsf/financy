import type { Prisma, TransactionType } from '@prisma/client';
import { notBillPayment, notBillPaymentSql, prisma } from '../../shared/prisma';
import { CATEGORY_SELECT, serializeTransaction } from '../../shared/serializers';
import { round2, toNumber } from '../../shared/utils/money';
import {
  addMonths,
  currentRef,
  daysInMonth,
  monthDiff,
  monthEnd,
  monthStart,
  refKey,
  type MonthRef,
} from '../../shared/utils/date';
import { isActiveIn } from '../recurring/recurring.service';
import { installmentProjection } from '../forecast/installments';
import { forecastService } from '../forecast/forecast.service';
import { billFingerprint } from '../transactions/transactions.service';

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

/**
 * Compras à vista no cartão por mês de competência: obrigação da fatura.
 * Parcelas e recorrências ficam de fora (já contam em "parcelas" e "contas fixas"); pagamento de fatura também.
 */
async function cardCommitments(userId: string, from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ ym: string; total: Prisma.Decimal }[]>`
    SELECT DATE_FORMAT(date, '%Y-%m') AS ym, SUM(amount) AS total
    FROM transactions
    WHERE userId = ${userId} AND type = 'EXPENSE' AND paymentMethod = 'CREDIT_CARD'
      AND (installmentTotal IS NULL OR installmentTotal < 2)
      AND source <> 'RECURRING'
      AND ${notBillPaymentSql}
      AND date >= ${from} AND date < ${to}
    GROUP BY ym`;
  return new Map(rows.map((r) => [r.ym, toNumber(r.total)]));
}

const pct = (part: number, whole: number) => (whole > 0 ? round2((part / whole) * 100) : 0);

export const dashboardService = {
  async overview(userId: string, ref: MonthRef) {
    const start = monthStart(ref);
    const end = monthEnd(ref);
    const where = { userId, date: { gte: start, lt: end } };
    // Pagamento de fatura fora dos totais
    const totalsWhere = { ...where, ...notBillPayment };

    const prevRef = addMonths(ref, -1);
    const ahead = monthDiff(currentRef(), ref);
    const [trend, commit, prevCommit, cardRows, byCat, daily, recent, categories, billPaid, recurrings, launchedRec, lastCard] = await Promise.all([
      monthlyTotals(userId, monthStart(addMonths(ref, -5)), end),
      commitments(userId, ref),
      commitments(userId, prevRef),
      cardCommitments(userId, monthStart(prevRef), end),
      prisma.transaction.groupBy({ by: ['categoryId'], where: { ...totalsWhere, type: 'EXPENSE' }, _sum: { amount: true } }),
      // por dia e forma de pagamento: alimenta o gráfico diário e a situação (pago/pendente)
      prisma.transaction.groupBy({ by: ['date', 'paymentMethod'], where: { ...totalsWhere, type: 'EXPENSE' }, _sum: { amount: true } }),
      prisma.transaction.findMany({
        where,
        include: { category: { select: CATEGORY_SELECT } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 6,
      }),
      prisma.category.findMany({ where: { userId } }),
      prisma.transaction.findUnique({ where: { userId_fingerprint: { userId, fingerprint: billFingerprint(ref) } }, select: { id: true } }),
      prisma.recurring.findMany({ where: { userId, active: true, type: 'EXPENSE' } }),
      prisma.transaction.findMany({ where: { userId, fingerprint: { startsWith: 'rec:' }, date: { gte: start, lt: end } }, select: { fingerprint: true } }),
      // dia de vencimento da última fatura importada (posiciona as parcelas previstas no gráfico)
      prisma.transaction.findFirst({
        where: { userId, paymentMethod: 'CREDIT_CARD', importBatchId: { not: null } },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
    ]);

    // mês atual e futuros: usa a mesma projeção da tela de previsões (renda + fixas + parcelas + média de variáveis)
    const forecast = ahead >= 0 && ahead <= 24 ? await forecastService.forecast(userId, Math.max(ahead, 1)) : null;
    const projected = new Map(forecast?.months.map((m) => [m.month, { income: m.income, expense: m.expense }]) ?? []);
    const totalsOf = (key: string) => projected.get(key) ?? trend.get(key) ?? { income: 0, expense: 0 };

    const current = totalsOf(refKey(ref));
    const previous = totalsOf(refKey(prevRef));
    const isProjected = projected.has(refKey(ref));
    const incomeBase = Math.max(commit.expectedIncome, current.income);
    // compras à vista no cartão (parcelas e recorrências já estão nas outras linhas)
    const card = cardRows.get(refKey(ref)) ?? 0;
    const committedTotal = commit.fixed + commit.installments + card;
    const prevIncomeBase = Math.max(prevCommit.expectedIncome, previous.income);
    const prevCommittedTotal = prevCommit.fixed + prevCommit.installments + (cardRows.get(refKey(prevRef)) ?? 0);

    // ----- situação das despesas do mês (sem contar nada duas vezes) -----
    // cartão: obrigação da fatura, só sai da conta quando a fatura é paga; demais formas: pagas até hoje
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    let paid = 0;
    let pending = 0;
    let cardRegistered = 0;
    for (const d of daily) {
      const v = toNumber(d._sum.amount);
      if (d.paymentMethod === 'CREDIT_CARD') cardRegistered += v;
      else if (d.date > today) pending += v;
      else paid += v;
    }
    if (billPaid) paid += cardRegistered;
    else pending += cardRegistered;
    const launchedIds = new Set(launchedRec.map((l) => l.fingerprint?.split(':')[1]));
    // contas fixas ainda não lançadas: só faz sentido no mês atual (mesma regra da previsão de fechamento)
    const pendingRecurrings = ahead === 0 ? recurrings.filter((r) => isActiveIn(r, ref) && !launchedIds.has(r.id)) : [];
    const pendingFixed = pendingRecurrings.reduce((a, r) => a + toNumber(r.amount), 0);
    const toLaunch = pendingFixed + commit.installmentsProjected;

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

    // ----- gastos acumulados: realizado (até hoje), previsto (até o fim do mês) e ritmo do orçamento -----
    const dim = daysInMonth(ref);
    const dailyMap = new Map<number, number>();
    for (const d of daily) dailyMap.set(d.date.getUTCDate(), (dailyMap.get(d.date.getUTCDate()) ?? 0) + toNumber(d._sum.amount));
    // último dia já realizado: mês passado = todos; mês atual = hoje; mês futuro = nenhum
    const lastRealDay = ahead < 0 ? dim : ahead === 0 ? today.getUTCDate() : 0;
    // o que ainda deve entrar no mês, por dia (contas fixas pendentes, parcelas previstas e variáveis restantes)
    const plannedExtra = new Map<number, number>();
    const addPlanned = (day: number, v: number) => plannedExtra.set(day, (plannedExtra.get(day) ?? 0) + v);
    if (forecast && ahead >= 0) {
      const fixedToCome = ahead === 0 ? pendingRecurrings : recurrings.filter((r) => isActiveIn(r, ref));
      // o que já deveria ter entrado e não foi lançado conta no próximo dia em aberto
      const firstOpen = Math.min(lastRealDay + 1, dim);
      const dayFor = (d: number) => Math.max(Math.min(d, dim), firstOpen);
      for (const r of fixedToCome) addPlanned(dayFor(r.dayOfMonth), toNumber(r.amount));
      addPlanned(dayFor(lastCard?.date.getUTCDate() ?? dim), commit.installmentsProjected);
      // variáveis: no mês atual, o que falta da média; em mês futuro, a média inteira
      const variable =
        ahead === 0
          ? Math.max(0, forecast.currentMonth.projected - forecast.currentMonth.spent - pendingFixed - commit.installmentsProjected)
          : forecast.averages.variable;
      const days = dim - lastRealDay;
      if (days > 0) for (let d = lastRealDay + 1; d <= dim; d++) addPlanned(d, variable / days);
      else addPlanned(dim, variable);
    }
    const budget = round2(categories.filter((c) => c.monthlyBudget && c.type === 'EXPENSE').reduce((a, c) => a + toNumber(c.monthlyBudget), 0));
    let cumulative = 0;
    let plannedCum = 0;
    const dailySeries = Array.from({ length: dim }, (_, i) => {
      const day = i + 1;
      const total = dailyMap.get(day) ?? 0;
      const real = day <= lastRealDay;
      if (real) cumulative += total;
      plannedCum = real ? cumulative : plannedCum + total + (plannedExtra.get(day) ?? 0);
      return {
        day,
        total: round2(total),
        cumulative: real ? round2(cumulative) : null,
        // previsto parte do último dia realizado para as linhas se encontrarem
        planned: forecast && day >= lastRealDay ? round2(plannedCum) : null,
        budget: budget > 0 ? round2((budget * day) / dim) : null,
      };
    });

    return {
      month: refKey(ref),
      summary: {
        income: round2(current.income),
        expense: round2(current.expense),
        balance: round2(current.income - current.expense),
        previousIncome: round2(previous.income),
        incomeChangePct: previous.income > 0 ? pct(current.income - previous.income, previous.income) : null,
        previousExpense: round2(previous.expense),
        expenseChangePct: previous.expense > 0 ? pct(current.expense - previous.expense, previous.expense) : null,
        /** mês futuro: valores projetados, não realizados */
        projected: isProjected,
      },
      committed: {
        incomeBase: round2(incomeBase),
        expectedIncome: commit.expectedIncome,
        fixed: commit.fixed,
        installments: commit.installments,
        installmentsProjected: commit.installmentsProjected,
        card: round2(card),
        total: round2(committedTotal),
        pct: pct(committedTotal, incomeBase),
        free: round2(incomeBase - committedTotal),
        // sem lançamentos no mês anterior não há base para comparar
        previousPct: prevIncomeBase > 0 && (previous.income || previous.expense) ? pct(prevCommittedTotal, prevIncomeBase) : null,
        spentPct: pct(current.expense, incomeBase),
        // desconta também o que ainda vai entrar no mês (contas fixas não lançadas e parcelas previstas)
        // projeção já inclui tudo isso
        available: round2(incomeBase - current.expense - (isProjected ? 0 : toLaunch)),
        /** % da renda já gasta ou reservada (despesas + a lançar) */
        usedPct: pct(current.expense + (isProjected ? 0 : toLaunch), incomeBase),
        /** situação das despesas do mês; null em mês projetado */
        status: isProjected
          ? null
          : { paid: round2(paid), pending: round2(pending), toLaunch: round2(toLaunch), cardBillPaid: !!billPaid },
      },
      pace: {
        budget: budget > 0 ? budget : null,
        projectedTotal: forecast ? (dailySeries[dim - 1]?.planned ?? null) : null,
        dayOfMonth: ahead === 0 ? lastRealDay : null,
      },
      byCategory,
      budgets,
      daily: dailySeries,
      trend: Array.from({ length: 6 }, (_, i) => {
        const key = refKey(addMonths(ref, i - 5));
        const t = totalsOf(key);
        return { month: key, income: round2(t.income), expense: round2(t.expense), balance: round2(t.income - t.expense), projected: projected.has(key) };
      }),
      recent: recent.map(serializeTransaction),
    };
  },
};
