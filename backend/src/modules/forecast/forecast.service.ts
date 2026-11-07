import type { Prisma } from '@prisma/client';
import { notBillPayment, notBillPaymentSql, prisma } from '../../shared/prisma';
import { round2, toNumber } from '../../shared/utils/money';
import {
  addMonths,
  currentRef,
  daysInMonth,
  monthDiff,
  monthEnd,
  monthStart,
  refKey,
  refOf,
} from '../../shared/utils/date';
import { isActiveIn } from '../recurring/recurring.service';
import { installmentProjection } from './installments';
import { commitments } from '../dashboard/dashboard.service';

const VARIABLE_WINDOW = 3;

export const forecastService = {
  async forecast(userId: string, months = 6) {
    const now = currentRef();
    const start = monthStart(now);
    const horizonEnd = monthEnd(addMonths(now, months));

    const [user, recurrings, futureInstallmentTxs, projection, futureTxs, variableRows, currentTxs, launchedRec, commit] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { monthlyIncome: true } }),
      prisma.recurring.findMany({ where: { userId, active: true } }),
      prisma.transaction.findMany({
        where: { userId, type: 'EXPENSE', installmentTotal: { gt: 1 }, date: { gte: monthEnd(now), lt: horizonEnd } },
        select: { amount: true, date: true },
      }),
      installmentProjection(userId, addMonths(now, 1), addMonths(now, months)),
      prisma.transaction.findMany({
        where: { userId, date: { gte: monthEnd(now), lt: horizonEnd }, installmentTotal: null, ...notBillPayment }, // sem pagamento de fatura
        select: { type: true, amount: true, date: true },
      }),
      prisma.$queryRaw<{ ym: string; total: Prisma.Decimal }[]>`
        SELECT DATE_FORMAT(date, '%Y-%m') AS ym, SUM(amount) AS total
        FROM transactions
        WHERE userId = ${userId} AND type = 'EXPENSE'
          AND (installmentTotal IS NULL OR installmentTotal < 2)
          AND source <> 'RECURRING'
          AND ${notBillPaymentSql} -- pagamento de fatura fora dos totais
          AND date >= ${monthStart(addMonths(now, -VARIABLE_WINDOW))} AND date < ${start}
        GROUP BY ym`,
      prisma.transaction.findMany({
        where: { userId, date: { gte: start, lt: monthEnd(now) }, ...notBillPayment }, // sem pagamento de fatura
        select: { type: true, amount: true, installmentTotal: true, source: true },
      }),
      prisma.transaction.findMany({
        where: { userId, fingerprint: { startsWith: `rec:` }, date: { gte: start, lt: monthEnd(now) } },
        select: { fingerprint: true },
      }),
      commitments(userId, now),
    ]);

    // Variáveis: média histórica com fallback no mês atual
    // gasto variável = despesa avulsa (sem parcela e sem recorrência); fatura do cartão já traz o ciclo inteiro
    const variableSoFar = currentTxs
      .filter((t) => t.type === 'EXPENSE' && !(t.installmentTotal && t.installmentTotal > 1) && t.source !== 'RECURRING')
      .reduce((a, t) => a + toNumber(t.amount), 0);
    // sem histórico anterior (ex.: primeira fatura importada), usa o próprio mês atual como base
    const variableAvg = variableRows.length
      ? round2(variableRows.reduce((a, r) => a + toNumber(r.total), 0) / variableRows.length)
      : round2(variableSoFar);
    const variableMonths = variableRows.length || (variableSoFar > 0 ? 1 : 0);

    // ----- parcelas: lançadas em meses futuros + projetadas pelo nº da parcela (ex.: 7/12 → 8/12 no mês seguinte) -----
    const projectedInstallments = new Map(projection.byMonth);
    const addTo = (key: string, v: number) => projectedInstallments.set(key, (projectedInstallments.get(key) ?? 0) + v);
    for (const t of futureInstallmentTxs) addTo(refKey(refOf(t.date)), toNumber(t.amount));

    const installmentsDetail = projection.open
      .map((o) => {
        const [y, m] = o.endMonth.split('-').map(Number);
        return { description: o.description, amount: o.amount, remaining: monthDiff(now, { year: y, month: m }), endMonth: o.endMonth };
      })
      .filter((o) => o.remaining >= 1);

    // ----- meses futuros -----
    let cumulative = 0;
    const monthsOut = Array.from({ length: months }, (_, i) => {
      const ref = addMonths(now, i + 1);
      const key = refKey(ref);
      const active = recurrings.filter((r) => isActiveIn(r, ref));
      const recIncome = active.filter((r) => r.type === 'INCOME').reduce((a, r) => a + toNumber(r.amount), 0);
      const fixed = active.filter((r) => r.type === 'EXPENSE').reduce((a, r) => a + toNumber(r.amount), 0);
      const scheduled = futureTxs.filter((t) => refKey(refOf(t.date)) === key);
      const scheduledIncome = scheduled.filter((t) => t.type === 'INCOME').reduce((a, t) => a + toNumber(t.amount), 0);
      const scheduledExpense = scheduled.filter((t) => t.type === 'EXPENSE').reduce((a, t) => a + toNumber(t.amount), 0);
      const installments = projectedInstallments.get(key) ?? 0;

      const income = toNumber(user.monthlyIncome) + recIncome + scheduledIncome;
      const expense = fixed + installments + variableAvg + scheduledExpense;
      const balance = income - expense;
      cumulative += balance;
      return {
        month: key,
        income: round2(income),
        fixed: round2(fixed),
        installments: round2(installments),
        variable: variableAvg,
        scheduled: round2(scheduledExpense),
        expense: round2(expense),
        balance: round2(balance),
        cumulative: round2(cumulative),
        committedPct: income > 0 ? round2(((fixed + installments) / income) * 100) : 0,
      };
    });

    // ----- projeção de fechamento do mês atual -----
    const today = new Date().getDate();
    const dim = daysInMonth(now);
    const spent = currentTxs.filter((t) => t.type === 'EXPENSE').reduce((a, t) => a + toNumber(t.amount), 0);
    const income = currentTxs.filter((t) => t.type === 'INCOME').reduce((a, t) => a + toNumber(t.amount), 0);
    const launchedIds = new Set(launchedRec.map((l) => l.fingerprint?.split(':')[1]));
    const pendingFixed = recurrings
      .filter((r) => r.type === 'EXPENSE' && isActiveIn(r, now) && !launchedIds.has(r.id))
      .reduce((a, r) => a + toNumber(r.amount), 0);
    // Fechamento = gasto real + o que falta da média de variáveis (sem extrapolar contas pontuais pelo ritmo diário)
    const projected = spent + Math.max(0, variableAvg - variableSoFar) + pendingFixed + commit.installmentsProjected;
    const incomeBase = Math.max(commit.expectedIncome, income);

    return {
      currentMonth: {
        month: refKey(now),
        spent: round2(spent),
        projected: round2(projected),
        income: round2(incomeBase),
        projectedBalance: round2(incomeBase - projected),
        dayOfMonth: today,
        daysInMonth: dim,
      },
      averages: { variable: variableAvg, monthsConsidered: variableMonths }, // inclui fallback do mês atual
      months: monthsOut,
      installments: installmentsDetail.sort((a, b) => b.amount - a.amount),
    };
  },
};
