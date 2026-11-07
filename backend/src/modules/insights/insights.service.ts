import { notBillPayment, prisma } from '../../shared/prisma';
import { round2, toNumber } from '../../shared/utils/money';
import { addMonths, currentRef, monthEnd, monthStart, refKey, refOf } from '../../shared/utils/date';
import { descriptionKey } from '../../shared/utils/text';
import { dashboardService } from '../dashboard/dashboard.service';
import { forecastService } from '../forecast/forecast.service';

type Level = 'positive' | 'info' | 'warning' | 'danger';

export interface Insight {
  id: string;
  level: Level;
  title: string;
  description: string;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const insightsService = {
  async list(userId: string): Promise<Insight[]> {
    const now = currentRef();
    const today = new Date().getDate();
    const prev = addMonths(now, -1);
    const windowStart = monthStart(addMonths(now, -3));

    const [overview, forecast, history, catNames, prevSamePeriod] = await Promise.all([
      dashboardService.overview(userId, now),
      forecastService.forecast(userId, 6),
      prisma.transaction.findMany({
        where: { userId, type: 'EXPENSE', date: { gte: windowStart, lt: monthEnd(now) }, ...notBillPayment }, // sem pagamento de fatura
        select: { description: true, amount: true, date: true, purchaseDate: true, categoryId: true, installmentTotal: true },
      }),
      prisma.category.findMany({ where: { userId }, select: { id: true, name: true } }),
      prisma.transaction.aggregate({
        where: {
          userId,
          type: 'EXPENSE',
          date: { gte: monthStart(prev), lt: new Date(Date.UTC(prev.year, prev.month - 1, today + 1)) },
          ...notBillPayment, // sem pagamento de fatura
        },
        _sum: { amount: true },
      }),
    ]);

    const insights: Insight[] = [];
    const { summary, committed, budgets } = overview;
    const nameOf = new Map(catNames.map((c) => [c.id, c.name]));
    const thisMonth = history.filter((t) => t.date >= monthStart(now));
    const past = history.filter((t) => t.date < monthStart(now));

    if (!history.length) {
      return [{
        id: 'empty',
        level: 'info',
        title: 'Comece registrando seus gastos',
        description: 'Importe a fatura do Nubank ou cadastre despesas manualmente para receber análises personalizadas.',
      }];
    }

    // 1. Ritmo vs mês anterior (mesmo período)
    const prevPeriod = toNumber(prevSamePeriod._sum.amount);
    if (prevPeriod > 0) {
      const diff = ((summary.expense - prevPeriod) / prevPeriod) * 100;
      if (Math.abs(diff) >= 10) {
        insights.push({
          id: 'pace',
          level: diff > 0 ? 'warning' : 'positive',
          title: diff > 0 ? `Gastos ${round2(diff)}% acima do mês passado` : `Gastos ${round2(-diff)}% abaixo do mês passado`,
          description: `Até o dia ${today} você gastou ${brl(summary.expense)}, contra ${brl(prevPeriod)} no mesmo período do mês anterior.`,
        });
      }
    }

    // 2. Salário comprometido
    if (committed.incomeBase > 0) {
      if (committed.pct >= 70) {
        insights.push({ id: 'committed', level: 'danger', title: `${committed.pct}% da renda já está comprometida`, description: `Contas fixas e parcelas somam ${brl(committed.total)}. O recomendado é manter abaixo de 50%.` });
      } else if (committed.pct >= 50) {
        insights.push({ id: 'committed', level: 'warning', title: `${committed.pct}% da renda comprometida`, description: `Contas fixas e parcelas somam ${brl(committed.total)}. Evite novas parcelas para não apertar o orçamento.` });
      }
      if (committed.spentPct >= 100) {
        insights.push({ id: 'overspent', level: 'danger', title: 'Gastos superaram a renda do mês', description: `Você já gastou ${brl(summary.expense)} de uma renda de ${brl(committed.incomeBase)}.` });
      }
    } else {
      insights.push({ id: 'no-income', level: 'info', title: 'Informe sua renda mensal', description: 'Cadastre seu salário em Configurações para calcular quanto da renda está comprometida.' });
    }

    // 3. Orçamentos
    for (const b of budgets) {
      if (b.pct >= 100) insights.push({ id: `budget-${b.categoryId}`, level: 'danger', title: `Orçamento de ${b.name} estourado`, description: `Gasto de ${brl(b.spent)} para um limite de ${brl(b.budget)} (${b.pct}%).` });
      else if (b.pct >= 80) insights.push({ id: `budget-${b.categoryId}`, level: 'warning', title: `${b.name} perto do limite`, description: `${b.pct}% do orçamento usado (${brl(b.spent)} de ${brl(b.budget)}).` });
    }

    // 4. Categoria com maior alta vs média dos 3 meses anteriores
    const pastMonths = new Set(past.map((t) => refKey(refOf(t.date)))).size;
    if (pastMonths > 0) {
      const sumBy = (rows: typeof history) => {
        const m = new Map<string, number>();
        for (const r of rows) if (r.categoryId) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + toNumber(r.amount));
        return m;
      };
      const cur = sumBy(thisMonth);
      const avg = sumBy(past);
      let top: { id: string; diff: number; cur: number; avg: number } | null = null;
      for (const [id, value] of cur) {
        const a = (avg.get(id) ?? 0) / pastMonths;
        const diff = value - a;
        if (a > 0 && diff > a * 0.3 && diff > 50 && (!top || diff > top.diff)) top = { id, diff, cur: value, avg: a };
      }
      if (top) {
        insights.push({ id: 'category-up', level: 'warning', title: `${nameOf.get(top.id)} subiu este mês`, description: `${brl(top.cur)} até agora contra média de ${brl(round2(top.avg))} nos últimos meses.` });
      }
    }

    // 5. Assinaturas recorrentes detectadas
    const byKey = new Map<string, { months: Set<string>; amounts: number[]; label: string }>();
    for (const t of history) {
      if (t.installmentTotal && t.installmentTotal > 1) continue;
      const key = descriptionKey(t.description);
      if (key.length < 3) continue;
      const e = byKey.get(key) ?? { months: new Set(), amounts: [], label: t.description };
      e.months.add(refKey(refOf(t.date)));
      e.amounts.push(toNumber(t.amount));
      byKey.set(key, e);
    }
    const subs = [...byKey.values()].filter((e) => {
      if (e.months.size < 3) return false;
      const min = Math.min(...e.amounts);
      const max = Math.max(...e.amounts);
      return e.amounts.length <= e.months.size + 1 && max - min <= max * 0.1;
    });
    if (subs.length) {
      const total = subs.reduce((a, s) => a + s.amounts[s.amounts.length - 1], 0);
      insights.push({
        id: 'subscriptions',
        level: 'info',
        title: `${subs.length} possíveis assinaturas detectadas`,
        description: `${subs.slice(0, 4).map((s) => s.label).join(', ')}${subs.length > 4 ? '…' : ''} somam cerca de ${brl(round2(total))}/mês. Revise se todas ainda fazem sentido.`,
      });
    }

    // 6. Gastos formiga (compras pequenas)
    const small = thisMonth.filter((t) => toNumber(t.amount) < 30);
    const smallTotal = small.reduce((a, t) => a + toNumber(t.amount), 0);
    if (small.length >= 10) {
      insights.push({ id: 'small', level: 'info', title: `${small.length} compras abaixo de R$ 30`, description: `Os "gastos formiga" somam ${brl(round2(smallTotal))} neste mês.` });
    }

    // 7. Maior estabelecimento do mês
    const merchants = new Map<string, { label: string; total: number; count: number }>();
    for (const t of thisMonth) {
      const key = descriptionKey(t.description);
      const e = merchants.get(key) ?? { label: t.description, total: 0, count: 0 };
      e.total += toNumber(t.amount);
      e.count++;
      merchants.set(key, e);
    }
    const topMerchant = [...merchants.values()].sort((a, b) => b.total - a.total)[0];
    if (topMerchant && topMerchant.count > 1) {
      insights.push({ id: 'merchant', level: 'info', title: `Onde você mais gastou: ${topMerchant.label}`, description: `${topMerchant.count} compras somando ${brl(round2(topMerchant.total))} neste mês.` });
    }

    // 8. Fim de semana
    // Dia da semana pela data real da compra (itens de fatura têm date = vencimento)
    const weekend = thisMonth.filter((t) => [0, 6].includes((t.purchaseDate ?? t.date).getUTCDay())).reduce((a, t) => a + toNumber(t.amount), 0);
    if (summary.expense > 0 && weekend / summary.expense >= 0.45) {
      insights.push({ id: 'weekend', level: 'info', title: `${Math.round((weekend / summary.expense) * 100)}% dos gastos no fim de semana`, description: `Sábados e domingos concentram ${brl(round2(weekend))} das despesas do mês.` });
    }

    // 9. Taxa de poupança do mês anterior
    const prevTrend = overview.trend.find((t) => t.month === refKey(prev));
    if (prevTrend && prevTrend.income > 0) {
      const rate = ((prevTrend.income - prevTrend.expense) / prevTrend.income) * 100;
      insights.push(
        rate >= 20
          ? { id: 'savings', level: 'positive', title: `Você poupou ${Math.round(rate)}% no mês passado`, description: 'Ótimo! Manter ao menos 20% da renda guardada acelera suas metas.' }
          : { id: 'savings', level: rate < 0 ? 'danger' : 'warning', title: rate < 0 ? 'Mês passado fechou no negativo' : `Poupança de ${Math.round(rate)}% no mês passado`, description: 'Tente reservar ao menos 20% da renda logo que o salário entrar.' },
      );
    }

    // 10. Previsão
    const cm = forecast.currentMonth;
    if (cm.income > 0 && cm.projectedBalance < 0) {
      insights.push({ id: 'projection', level: 'danger', title: 'Projeção de fechar o mês no vermelho', description: `No ritmo atual, os gastos devem chegar a ${brl(cm.projected)}, ${brl(-cm.projectedBalance)} acima da renda.` });
    }
    const negative = forecast.months.find((m) => m.balance < 0);
    if (negative) {
      insights.push({ id: 'forecast-negative', level: 'warning', title: `Atenção com ${negative.month}`, description: `A previsão indica saldo de ${brl(negative.balance)} nesse mês considerando contas fixas, parcelas e média de gastos.` });
    }
    const freeing = forecast.installments.filter((i) => i.remaining <= 1);
    if (freeing.length) {
      const total = freeing.reduce((a, i) => a + i.amount, 0);
      insights.push({ id: 'installments-ending', level: 'positive', title: `${freeing.length} parcelamento(s) terminando`, description: `A partir do próximo mês você terá ${brl(round2(total))} a mais livres na fatura.` });
    }

    const order: Record<Level, number> = { danger: 0, warning: 1, info: 2, positive: 3 };
    return insights.sort((a, b) => order[a.level] - order[b.level]);
  },
};
