import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Plus, Receipt, Upload, Wallet } from 'lucide-react';
import { api, qs } from '../lib/api';
import { brl, brlCompact, cn, currentMonth, monthShort } from '../lib/format';
import type { Dashboard, Insight, Transaction } from '../lib/types';
import { Card, CardTitle, Empty, PageHeader, Progress, Ring, Spinner } from '../components/ui/misc';
import { Button } from '../components/ui/controls';
import { MonthPicker } from '../components/MonthPicker';
import { CategoryIcon } from '../components/CategoryIcon';
import { TransactionRow } from '../components/TransactionRow';
import { TransactionForm } from '../components/TransactionForm';
import { InsightCard } from './Insights';
import { useAuth } from '../lib/auth';

const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: '1px solid #e4e4e7', fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,.06)' },
  labelStyle: { color: '#71717a' },
};

function Stat({ label, value, icon, tone, footer }: { label: string; value: number; icon: React.ReactNode; tone?: 'green' | 'red'; footer?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        {label}
        {icon}
      </div>
      <p className={cn('tabular text-2xl font-semibold tracking-tight', tone === 'red' && 'text-red-600 dark:text-red-400', tone === 'green' && 'text-emerald-600 dark:text-emerald-400')}>
        {brl(value)}
      </p>
      {footer && <div className="text-xs text-zinc-500">{footer}</div>}
    </Card>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => api.get<Dashboard>(`/dashboard${qs({ month })}`),
  });
  const { data: insights } = useQuery({ queryKey: ['insights'], queryFn: () => api.get<Insight[]>('/insights') });

  const openForm = (tx: Transaction | null = null) => {
    setEditing(tx);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title={`Olá, ${user?.name.split(' ')[0]}`}
        subtitle="Aqui está o resumo das suas finanças."
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <Button onClick={() => openForm()}>
              <Plus className="h-4 w-4" /> Nova
            </Button>
          </>
        }
      />

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Receitas" value={data.summary.income} icon={<ArrowUpRight className="h-4 w-4 text-emerald-500" />} />
            <Stat
              label="Despesas"
              value={data.summary.expense}
              icon={<ArrowDownRight className="h-4 w-4 text-red-500" />}
              footer={
                data.summary.expenseChangePct != null && (
                  <span className={data.summary.expenseChangePct > 0 ? 'text-red-500' : 'text-emerald-600'}>
                    {data.summary.expenseChangePct > 0 ? '▲' : '▼'} {Math.abs(data.summary.expenseChangePct)}% vs mês anterior
                  </span>
                )
              }
            />
            <Stat label="Saldo do mês" value={data.summary.balance} tone={data.summary.balance < 0 ? 'red' : 'green'} icon={<Wallet className="h-4 w-4" />} />
            <Stat
              label="Disponível"
              value={data.committed.available}
              tone={data.committed.available < 0 ? 'red' : undefined}
              icon={<Receipt className="h-4 w-4" />}
              footer={data.committed.incomeBase > 0 ? `${data.committed.spentPct}% da renda já gasta` : 'Cadastre sua renda em Configurações'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col">
              <CardTitle>Salário comprometido</CardTitle>
              {data.committed.incomeBase > 0 ? (
                <div className="flex flex-1 flex-col items-center gap-5">
                  <Ring value={data.committed.pct} size={140} stroke={12}>
                    <span className="tabular text-2xl font-semibold">{Math.round(data.committed.pct)}%</span>
                    <span className="text-xs text-zinc-500">comprometido</span>
                  </Ring>
                  <div className="w-full space-y-2 text-sm">
                    <Row label="Renda considerada" value={data.committed.incomeBase} />
                    <Row label="Contas fixas" value={data.committed.fixed} />
                    <Row label="Parcelas do mês" value={data.committed.installments} />
                    {data.committed.installmentsProjected > 0 && (
                      <p className="-mt-1 text-right text-[11px] text-zinc-400">
                        inclui {brl(data.committed.installmentsProjected)} previstos (fatura ainda não importada)
                      </p>
                    )}
                    <div className="border-t border-zinc-100 pt-2 dark:border-zinc-800">
                      <Row label="Livre após compromissos" value={data.committed.incomeBase - data.committed.total} strong />
                    </div>
                  </div>
                </div>
              ) : (
                <Empty icon={Wallet} title="Informe sua renda" description="Cadastre seu salário para calcular o comprometimento." action={<Link to="/configuracoes"><Button variant="secondary" size="sm">Configurar</Button></Link>} />
              )}
            </Card>

            <Card className="lg:col-span-2">
              <CardTitle>Gastos acumulados no mês</CardTitle>
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={data.daily} margin={{ left: -10, right: 4, top: 4 }}>
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.6} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="#a1a1aa" />
                    <YAxis tickFormatter={brlCompact} tickLine={false} axisLine={false} fontSize={11} stroke="#a1a1aa" width={70} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => brl(v)} labelFormatter={(d) => `Dia ${d}`} />
                    <Area type="monotone" dataKey="cumulative" name="Acumulado" stroke="#10b981" strokeWidth={2} fill="url(#g)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardTitle>Por categoria</CardTitle>
              {data.byCategory.length ? (
                <>
                  <div className="h-44">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={data.byCategory} dataKey="total" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={2} stroke="none">
                          {data.byCategory.map((c) => (
                            <Cell key={c.name} fill={c.color} />
                          ))}
                        </Pie>
                        <Tooltip {...tooltipStyle} formatter={(v: number) => brl(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-4 space-y-2.5">
                    {data.byCategory.slice(0, 6).map((c) => (
                      <li key={c.name} className="flex items-center gap-3 text-sm">
                        <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="text-xs text-zinc-400">{c.share}%</span>
                        <span className="tabular w-24 text-right font-medium">{brl(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Empty icon={Receipt} title="Sem despesas neste mês" />
              )}
            </Card>

            <Card className="lg:col-span-2">
              <CardTitle>Últimos 6 meses</CardTitle>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={data.trend} margin={{ left: -10, right: 4, top: 4 }} barGap={4}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.6} />
                    <XAxis dataKey="month" tickFormatter={monthShort} tickLine={false} axisLine={false} fontSize={11} stroke="#a1a1aa" />
                    <YAxis tickFormatter={brlCompact} tickLine={false} axisLine={false} fontSize={11} stroke="#a1a1aa" width={70} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => brl(v)} labelFormatter={(m) => monthShort(String(m))} cursor={{ fill: 'rgba(161,161,170,.08)' }} />
                    <Bar dataKey="income" name="Receitas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="expense" name="Despesas" fill="#18181b" className="dark:fill-zinc-300" radius={[6, 6, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardTitle action={<Link to="/transacoes" className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white">Ver todas</Link>}>
                Transações recentes
              </CardTitle>
              {data.recent.length ? (
                <div className="-mx-2">
                  {data.recent.map((t) => (
                    <TransactionRow key={t.id} tx={t} onClick={() => openForm(t)} />
                  ))}
                </div>
              ) : (
                <Empty
                  icon={Upload}
                  title="Nenhuma transação ainda"
                  description="Importe a fatura do Nubank ou adicione manualmente."
                  action={<Link to="/importar"><Button size="sm">Importar fatura</Button></Link>}
                />
              )}
            </Card>

            <div className="flex flex-col gap-4">
              {data.budgets.length > 0 && (
                <Card>
                  <CardTitle>Orçamentos</CardTitle>
                  <ul className="space-y-4">
                    {data.budgets.slice(0, 5).map((b) => (
                      <li key={b.categoryId}>
                        <div className="mb-1.5 flex justify-between text-sm">
                          <span>{b.name}</span>
                          <span className="tabular text-xs text-zinc-500">
                            {brl(b.spent)} / {brl(b.budget)}
                          </span>
                        </div>
                        <Progress value={b.pct} />
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <Card>
                <CardTitle action={<Link to="/insights" className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white">Ver todos</Link>}>Insights</CardTitle>
                <div className="flex flex-col gap-2">
                  {insights?.slice(0, 3).map((i) => <InsightCard key={i.id} insight={i} compact />) ?? <Spinner className="py-6" />}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} transaction={editing} />
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={cn('tabular', strong && 'font-semibold', value < 0 && 'text-red-500')}>{brl(value)}</span>
    </div>
  );
}
