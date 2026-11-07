import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, qs } from '../lib/api';
import { brl, brlCompact, cn, monthLong, monthShort } from '../lib/format';
import type { Forecast } from '../lib/types';
import { Card, CardTitle, PageHeader, Progress, Spinner } from '../components/ui/misc';
import { Segmented } from '../components/ui/controls';

export function ForecastPage() {
  const [months, setMonths] = useState<'3' | '6' | '12'>('6');
  const { data, isLoading } = useQuery({
    queryKey: ['forecast', months],
    queryFn: () => api.get<Forecast>(`/forecast${qs({ months })}`),
  });

  return (
    <>
      <PageHeader
        title="Previsões"
        subtitle="Projeção baseada na sua renda, contas fixas, parcelas futuras e média de gastos variáveis."
        actions={<Segmented value={months} onChange={setMonths} options={[{ value: '3', label: '3 meses' }, { value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }]} />}
      />

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>Fechamento previsto de {monthLong(data.currentMonth.month)}</CardTitle>
            <div className="grid gap-6 sm:grid-cols-4">
              <Metric label="Gasto até hoje" value={data.currentMonth.spent} />
              <Metric label="Previsão de gastos" value={data.currentMonth.projected} />
              <Metric label="Renda do mês" value={data.currentMonth.income} />
              <Metric label="Saldo previsto" value={data.currentMonth.projectedBalance} colored />
            </div>
            <div className="mt-5">
              <div className="mb-1.5 flex justify-between text-xs text-zinc-500">
                <span>Dia {data.currentMonth.dayOfMonth} de {data.currentMonth.daysInMonth}</span>
                <span>{data.currentMonth.income > 0 ? `${Math.round((data.currentMonth.projected / data.currentMonth.income) * 100)}% da renda` : ''}</span>
              </div>
              <Progress value={data.currentMonth.income > 0 ? (data.currentMonth.projected / data.currentMonth.income) * 100 : 0} />
            </div>
          </Card>

          <Card>
            <CardTitle>Próximos meses</CardTitle>
            <div className="h-80">
              <ResponsiveContainer>
                <ComposedChart data={data.months} margin={{ left: -10, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.6} />
                  <XAxis dataKey="month" tickFormatter={monthShort} tickLine={false} axisLine={false} fontSize={11} stroke="#a1a1aa" />
                  <YAxis tickFormatter={brlCompact} tickLine={false} axisLine={false} fontSize={11} stroke="#a1a1aa" width={70} />
                  <Tooltip
                    formatter={(v: number) => brl(v)}
                    labelFormatter={(m) => monthLong(String(m))}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e4e4e7', fontSize: 12 }}
                    cursor={{ fill: 'rgba(161,161,170,.08)' }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="fixed" name="Fixas" stackId="e" fill="#6366f1" maxBarSize={36} />
                  <Bar dataKey="installments" name="Parcelas" stackId="e" fill="#f59e0b" maxBarSize={36} />
                  <Bar dataKey="variable" name="Variáveis (média)" stackId="e" fill="#a1a1aa" maxBarSize={36} />
                  <Bar dataKey="scheduled" name="Agendadas" stackId="e" fill="#ec4899" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  <Line dataKey="income" name="Renda" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Gastos variáveis estimados em {brl(data.averages.variable)}/mês
              {/* Fallback no mês atual quando não há histórico */}
              {data.averages.monthsConsidered > 1
                ? ` (média dos últimos ${data.averages.monthsConsidered} meses)`
                : data.averages.monthsConsidered === 1
                  ? ' (com base em 1 mês de histórico)'
                  : ' — sem histórico suficiente ainda'}
              .
            </p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-0 lg:col-span-2">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800">
                      <th className="py-3 pl-5 font-medium">Mês</th>
                      <th className="py-3 text-right font-medium">Renda</th>
                      <th className="py-3 text-right font-medium">Gastos</th>
                      <th className="py-3 text-right font-medium">Comprometido</th>
                      <th className="py-3 text-right font-medium">Saldo</th>
                      <th className="py-3 pr-5 text-right font-medium">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.months.map((m) => (
                      <tr key={m.month} className="border-b border-zinc-50 last:border-0 dark:border-zinc-800/60">
                        <td className="py-3 pl-5 font-medium capitalize">{monthShort(m.month)}</td>
                        <td className="tabular py-3 text-right">{brl(m.income)}</td>
                        <td className="tabular py-3 text-right">{brl(m.expense)}</td>
                        <td className={cn('tabular py-3 text-right', m.committedPct >= 70 ? 'text-red-500' : m.committedPct >= 50 ? 'text-amber-500' : '')}>{m.committedPct}%</td>
                        <td className={cn('tabular py-3 text-right font-medium', m.balance < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400')}>{brl(m.balance)}</td>
                        <td className={cn('tabular py-3 pr-5 text-right', m.cumulative < 0 && 'text-red-500')}>{brl(m.cumulative)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardTitle>Parcelamentos em aberto</CardTitle>
              {data.installments.length ? (
                <ul className="space-y-3">
                  {data.installments.slice(0, 10).map((i, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{i.description}</p>
                        <p className="text-xs text-zinc-500">
                          {i.remaining} restante(s) · termina em {monthShort(i.endMonth)}
                        </p>
                      </div>
                      <span className="tabular shrink-0 font-medium">{brl(i.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">Nenhuma compra parcelada em aberto.</p>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Metric({ label, value, colored }: { label: string; value: number; colored?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={cn('tabular mt-1 text-xl font-semibold', colored && (value < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'))}>{brl(value)}</p>
    </div>
  );
}
