import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, CreditCard, Plus, Receipt, Repeat, Undo2, Upload, Wallet } from 'lucide-react';
import { api, qs } from '../lib/api';
import { brl, brlCompact, cn, currentMonth, dateBR, monthBounds, monthShort, PAYMENT_LABELS, todayISO } from '../lib/format';
import type { Dashboard, Insight, Invoice, PaymentMethod, Transaction, TransactionList } from '../lib/types';
import { Badge, Card, CardTitle, Empty, InfoTip, PageHeader, Progress, Ring, Spinner } from '../components/ui/misc';
import { Button, Field, Input, MoneyInput, Segmented, Select } from '../components/ui/controls';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { useInvalidateFinance } from '../hooks/queries';
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

/** Legenda com texto neutro (legível no tema claro e escuro). */
const legendStyle = {
  iconType: 'circle' as const,
  iconSize: 8,
  wrapperStyle: { fontSize: 12 },
  formatter: (v: string) => <span className="text-zinc-500">{v}</span>,
};

/** Despesas usa preto/zinco por tema; na legenda fica um cinza visível nos dois. */
const TREND_LEGEND = [
  { value: 'Receitas', type: 'circle' as const, color: '#10b981' },
  { value: 'Despesas', type: 'circle' as const, color: '#71717a' },
  { value: 'Saldo', type: 'circle' as const, color: '#6366f1' },
];

/** Linhas da explicação do ícone "sobre" de cada bloco. */
const about = (...lines: string[]) => lines.map((l) => <span key={l} className="block">{l}</span>);

const ABOUT = {
  income: about(
    'Soma das entradas do mês pela data de competência, sem pagamentos de fatura.',
    'Mês futuro: renda do perfil + recorrências de entrada + entradas já agendadas.',
    'Variação = (receitas do mês − mês anterior) ÷ mês anterior.',
  ),
  expense: about(
    'Soma das saídas do mês pela competência: compras do cartão contam no mês da fatura. Pagamento de fatura não entra (as compras já contam).',
    'Variação = (despesas do mês − mês anterior) ÷ mês anterior.',
    'Mês futuro: contas fixas + parcelas (lançadas e previstas) + média de gastos variáveis + despesas agendadas.',
  ),
  balance: about('Receitas − despesas do mês.'),
  available: about(
    'Quanto ainda dá para gastar no mês sem ficar no vermelho.',
    'Renda considerada − despesas do mês − o que ainda vai entrar (contas fixas não lançadas e parcelas previstas ainda não importadas).',
    'Renda considerada = o maior valor entre a renda esperada (salário do perfil + recorrências de entrada) e as receitas lançadas.',
    '% = (despesas + a lançar) ÷ renda considerada.',
  ),
  committed: about(
    'Quanto da renda já está preso a compromissos.',
    'Cálculo: (contas fixas + parcelas + compras à vista no cartão) ÷ renda considerada.',
    'Contas fixas = recorrências de despesa ativas no mês. Parcelas = lançadas no mês + previstas a partir da última parcela conhecida de cada compra. Cartão = compras à vista na fatura do mês (parcelas e recorrências não entram de novo).',
    'Livre = renda considerada − total comprometido.',
    'Situação: pago = despesas até hoje fora do cartão + fatura, se paga; pendente = agendadas + fatura em aberto; a lançar = contas fixas não lançadas + parcelas previstas. O pagamento da fatura não conta de novo.',
  ),
  daily: about(
    'Realizado: despesas acumuladas até hoje, pela data de competência (itens de uma fatura aparecem juntos no dia da fatura).',
    'Previsto: realizado + despesas agendadas + contas fixas não lançadas + parcelas previstas + o que falta da média de gastos variáveis (mesma projeção da tela de previsões).',
    'Orçamento: soma dos orçamentos das categorias distribuída por igual nos dias do mês. Acima da linha = gastando mais rápido que o planejado.',
  ),
  byCategory: about('Despesas do mês agrupadas por categoria (6 maiores).', '% = total da categoria ÷ total de despesas do mês.'),
  trend: about(
    'Receitas e despesas dos 6 meses até o mês selecionado, por competência e sem pagamentos de fatura.',
    'Linha = saldo do mês (receitas − despesas); ponto vermelho = despesas maiores que receitas.',
    'Barras mais claras = meses futuros (valores previstos).',
  ),
  recent: about(
    'As 6 transações mais recentes do mês selecionado, incluindo pagamentos de fatura. Clique para editar.',
    'Situação: cartão segue a fatura do mês (paga ou em aberto); demais formas são pagas/recebidas na data, ou agendadas se a data ainda não chegou.',
  ),
  invoice: about(
    'Compras no cartão de crédito com competência neste mês.',
    'Total = compras − créditos/estornos. Sem fatura importada, mostra a previsão pelas parcelas.',
    '"Pagar fatura" registra a saída da conta, mas ela não entra nas despesas, pois as compras já foram contadas.',
  ),
  budgets: about('Gasto do mês em cada categoria comparado ao orçamento mensal definido em Categorias.', '% = gasto ÷ orçamento.'),
  insights: about('Observações automáticas geradas a partir das suas transações, como gastos pequenos frequentes, concentração no fim de semana e saldo do mês anterior.'),
};

function Stat({ label, value, icon, tone, footer, info }: { label: string; value: number; icon: React.ReactNode; tone?: 'green' | 'red'; footer?: React.ReactNode; info?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span className="flex items-center gap-1.5">
          {label}
          {info && <InfoTip>{info}</InfoTip>}
        </span>
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
          {data.summary.projected && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <Badge tone="amber">Previsão</Badge>
              Valores projetados: renda + contas fixas + parcelas + média de gastos variáveis.
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Receitas"
              info={ABOUT.income}
              value={data.summary.income}
              icon={<ArrowUpRight className="h-4 w-4 text-emerald-500" />}
              footer={<Change pct={data.summary.incomeChangePct} previous={data.summary.previousIncome} goodWhenUp />}
            />
            <Stat
              label="Despesas"
              info={ABOUT.expense}
              value={data.summary.expense}
              icon={<ArrowDownRight className="h-4 w-4 text-red-500" />}
              footer={<Change pct={data.summary.expenseChangePct} previous={data.summary.previousExpense} />}
            />
            <Stat
              label="Saldo do mês"
              info={ABOUT.balance}
              value={data.summary.balance}
              tone={data.summary.balance < 0 ? 'red' : 'green'}
              icon={<Wallet className="h-4 w-4" />}
              footer={
                <span className="flex items-center gap-1.5">
                  <Badge tone={data.summary.balance < 0 ? 'red' : 'green'}>{data.summary.balance < 0 ? 'Negativo' : 'Positivo'}</Badge>
                  {data.summary.balance < 0 ? 'despesas superaram as receitas' : 'receitas cobriram as despesas'}
                </span>
              }
            />
            <Stat
              label="Disponível"
              info={ABOUT.available}
              value={data.committed.available}
              tone={data.committed.available < 0 ? 'red' : undefined}
              icon={<Receipt className="h-4 w-4" />}
              footer={
                data.committed.incomeBase > 0 ? (
                  <div className="space-y-1.5">
                    <Progress value={data.committed.usedPct} />
                    <p>
                      {Math.round(data.committed.usedPct)}% da renda {data.summary.projected ? 'prevista em gastos' : 'já gasta ou reservada'} · livre para gastar
                    </p>
                  </div>
                ) : (
                  'Cadastre sua renda em Configurações'
                )
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="flex flex-col">
              <CardTitle info={ABOUT.committed}>Salário comprometido</CardTitle>
              {data.committed.incomeBase > 0 ? (
                <div className="flex flex-1 flex-col items-center gap-5">
                  <Ring value={data.committed.pct} size={140} stroke={12}>
                    <span className="tabular text-2xl font-semibold">{Math.round(data.committed.pct)}%</span>
                    <span className="text-xs text-zinc-500">comprometido</span>
                  </Ring>
                  {data.committed.previousPct != null && (
                    <p className="-mt-2 text-xs text-zinc-500">
                      Mês anterior: {Math.round(data.committed.previousPct)}%{' '}
                      <span className={data.committed.pct > data.committed.previousPct ? 'text-red-500' : 'text-emerald-600'}>
                        ({data.committed.pct > data.committed.previousPct ? '▲' : '▼'} {Math.abs(Math.round(data.committed.pct - data.committed.previousPct))} p.p.)
                      </span>
                    </p>
                  )}
                  <div className="w-full space-y-2 text-sm">
                    <Row label="Renda considerada" value={data.committed.incomeBase} />
                    <Row label="Contas fixas" value={data.committed.fixed} />
                    <Row label="Parcelas do mês" value={data.committed.installments} />
                    {data.committed.installmentsProjected > 0 && (
                      <p className="-mt-1 text-right text-[11px] text-zinc-400">
                        inclui {brl(data.committed.installmentsProjected)} previstos (fatura ainda não importada)
                      </p>
                    )}
                    <Row label="Cartão (compras à vista)" value={data.committed.card} />
                    <Row label="Total comprometido" value={data.committed.total} strong />
                    <div className="border-t border-zinc-100 pt-2 dark:border-zinc-800">
                      <Row label="Livre após compromissos" value={data.committed.free} strong />
                    </div>
                    {data.committed.status && (
                      <div className="space-y-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                        <p className="text-xs font-medium text-zinc-500">Situação das despesas</p>
                        <Row label="Pago" value={data.committed.status.paid} />
                        <Row label={data.committed.status.cardBillPaid ? 'Pendente' : 'Pendente (inclui fatura em aberto)'} value={data.committed.status.pending} />
                        {data.committed.status.toLaunch > 0 && <Row label="A lançar (fixas e parcelas previstas)" value={data.committed.status.toLaunch} />}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <Empty icon={Wallet} title="Informe sua renda" description="Cadastre seu salário para calcular o comprometimento." action={<Link to="/configuracoes"><Button variant="secondary" size="sm">Configurar</Button></Link>} />
              )}
            </Card>

            <Card className="lg:col-span-2">
              <CardTitle info={ABOUT.daily}>Gastos acumulados no mês</CardTitle>
              <PaceSummary data={data} />
              <div className="h-64">
                <ResponsiveContainer>
                  <ComposedChart data={data.daily} margin={{ left: -10, right: 4, top: 4 }}>
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
                    <Legend {...legendStyle} />
                    <Area type="monotone" dataKey="cumulative" name="Realizado" stroke="#10b981" strokeWidth={2} fill="url(#g)" connectNulls={false} />
                    {data.daily.some((d) => d.planned != null) && (
                      <Line type="monotone" dataKey="planned" name="Previsto" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" dot={false} />
                    )}
                    {data.pace.budget != null && (
                      <Line type="linear" dataKey="budget" name="Orçamento" stroke="#a1a1aa" strokeWidth={1.5} strokeDasharray="2 3" dot={false} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardTitle info={ABOUT.byCategory}>Por categoria</CardTitle>
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
              <CardTitle info={ABOUT.trend}>Últimos 6 meses</CardTitle>
              <TrendSummary trend={data.trend} />
              <div className="h-72">
                <ResponsiveContainer>
                  <ComposedChart data={data.trend} margin={{ left: -10, right: 4, top: 4 }} barGap={4}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.6} />
                    <XAxis dataKey="month" tickFormatter={monthShort} tickLine={false} axisLine={false} fontSize={11} stroke="#a1a1aa" />
                    <YAxis tickFormatter={brlCompact} tickLine={false} axisLine={false} fontSize={11} stroke="#a1a1aa" width={70} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => brl(v)} labelFormatter={(m) => monthShort(String(m))} cursor={{ fill: 'rgba(161,161,170,.08)' }} />
                    <Legend {...legendStyle} payload={TREND_LEGEND} />
                    <Bar dataKey="income" name="Receitas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={28}>
                      {data.trend.map((t) => <Cell key={t.month} fillOpacity={t.projected ? 0.4 : 1} />)}
                    </Bar>
                    <Bar dataKey="expense" name="Despesas" fill="#18181b" className="dark:fill-zinc-300" radius={[6, 6, 0, 0]} maxBarSize={28}>
                      {data.trend.map((t) => <Cell key={t.month} fillOpacity={t.projected ? 0.4 : 1} />)}
                    </Bar>
                    <ReferenceLine y={0} stroke="#a1a1aa" />
                    <Line
                      type="monotone"
                      dataKey="balance"
                      name="Saldo"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={(p: { cx?: number; cy?: number; payload?: { month: string; balance: number } }) => (
                        <circle key={p.payload?.month} cx={p.cx} cy={p.cy} r={4} fill={(p.payload?.balance ?? 0) < 0 ? '#ef4444' : '#6366f1'} stroke="white" strokeWidth={1.5} />
                      )}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="min-w-0 lg:col-span-2">
              <CardTitle info={ABOUT.recent} action={<Link to="/transacoes" className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white">Ver todas</Link>}>
                Transações recentes
              </CardTitle>
              {data.recent.length ? (
                <RecentTransactions month={month} all={data.recent} onOpen={openForm} />
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
              <InvoiceCard month={month} />
              {data.budgets.length > 0 && (
                <Card>
                  <CardTitle info={ABOUT.budgets}>Orçamentos</CardTitle>
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
                <CardTitle info={ABOUT.insights} action={<Link to="/insights" className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white">Ver todos</Link>}>Insights</CardTitle>
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

const BILL_METHODS: PaymentMethod[] = ['PIX', 'BOLETO', 'TRANSFER', 'DEBIT_CARD', 'CASH', 'OTHER'];

/** Fatura do cartão no mês (competência) com registro/estorno do pagamento. */
function InvoiceCard({ month }: { month: string }) {
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const [payOpen, setPayOpen] = useState(false);
  const [form, setForm] = useState({ date: todayISO(), amount: '', paymentMethod: 'PIX' as PaymentMethod });
  const { data: inv } = useQuery({
    queryKey: ['transactions', 'invoice', month],
    queryFn: () => api.get<Invoice>(`/transactions/invoice${qs({ month })}`),
  });

  const pay = useMutation({
    mutationFn: () => api.post('/transactions/invoice/pay', { month, date: form.date, amount: Number(form.amount), paymentMethod: form.paymentMethod }),
    onSuccess: async () => {
      setPayOpen(false);
      await invalidate();
      toast('Pagamento da fatura registrado');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  const undo = useMutation({
    mutationFn: (id: string) => api.del(`/transactions/${id}`),
    onSuccess: async () => {
      await invalidate();
      toast('Pagamento desfeito');
    },
  });

  if (!inv || (!inv.items && !inv.projectedInstallments && !inv.payment)) return null;
  const openPay = () => {
    setForm({ date: todayISO(), amount: (inv.total || inv.projectedInstallments).toFixed(2), paymentMethod: 'PIX' });
    setPayOpen(true);
  };

  return (
    <Card>
      <CardTitle info={ABOUT.invoice} action={inv.payment ? <Badge tone="green">Paga</Badge> : <Badge tone="amber">Em aberto</Badge>}>
        <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" /> Fatura de {monthShort(month)}</span>
      </CardTitle>
      <div className="space-y-2 text-sm">
        {inv.items > 0 ? (
          <>
            <Row label="Compras" value={inv.expense} />
            {inv.credits > 0 && <Row label="Créditos/estornos" value={-inv.credits} />}
            <div className="border-t border-zinc-100 pt-2 dark:border-zinc-800">
              <Row label="Total da fatura" value={inv.total} strong />
            </div>
          </>
        ) : (
          <Row label="Prevista (parcelas)" value={inv.projectedInstallments} strong />
        )}
        {inv.payment ? (
          <div className="flex items-center justify-between gap-2 pt-1 text-xs text-zinc-500">
            <span>
              Pago {brl(inv.payment.amount)} em {dateBR(inv.payment.date)} · {PAYMENT_LABELS[inv.payment.paymentMethod]}
              {Math.abs(inv.payment.amount - inv.total) >= 0.01 && inv.items > 0 && (
                <span className="block text-amber-600">Diferença de {brl(inv.total - inv.payment.amount)}</span>
              )}
            </span>
            <Button variant="ghost" size="sm" loading={undo.isPending} onClick={() => confirm('Desfazer o pagamento desta fatura?') && undo.mutate(inv.payment!.id)}>
              <Undo2 className="h-4 w-4" /> Desfazer
            </Button>
          </div>
        ) : (
          <Button className="mt-2 w-full" variant="secondary" onClick={openPay}>
            <CheckCircle2 className="h-4 w-4" /> Pagar fatura
          </Button>
        )}
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Pagar fatura de ${monthShort(month)}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button disabled={!Number(form.amount) || !form.date} loading={pay.isPending} onClick={() => pay.mutate()}>Confirmar pagamento</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Valor pago">
            <MoneyInput value={form.amount} onChange={(amount) => setForm((f) => ({ ...f, amount }))} />
          </Field>
          <Field label="Data do pagamento">
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </Field>
          <Field label="Forma de pagamento" hint="O pagamento não entra nas despesas: as compras da fatura já contam no mês.">
            <Select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as PaymentMethod }))}>
              {BILL_METHODS.map((m) => (
                <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

/** Variação vs mês anterior; `goodWhenUp` define se subir é bom (receitas) ou ruim (despesas). */
function Change({ pct, previous, goodWhenUp }: { pct: number | null; previous: number; goodWhenUp?: boolean }) {
  if (pct == null) return <span>Sem dados do mês anterior</span>;
  if (pct === 0) return <span>Igual ao mês anterior ({brl(previous)})</span>;
  const good = pct > 0 === !!goodWhenUp;
  return (
    <span>
      <span className={good ? 'text-emerald-600' : 'text-red-500'}>
        {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%
      </span>{' '}
      vs mês anterior ({brl(previous)})
    </span>
  );
}

/** Ritmo de gastos: realizado até hoje vs orçamento proporcional e fechamento previsto. */
function PaceSummary({ data }: { data: Dashboard }) {
  const { budget, projectedTotal, dayOfMonth } = data.pace;
  const today = dayOfMonth ? data.daily[dayOfMonth - 1] : null;
  const parts: React.ReactNode[] = [];
  if (today?.cumulative != null && today.budget != null) {
    const diff = today.cumulative - today.budget;
    parts.push(
      <span key="pace" className={diff > 0 ? 'text-red-500' : 'text-emerald-600'}>
        {diff > 0 ? `${brl(diff)} acima` : `${brl(-diff)} abaixo`} do ritmo do orçamento até hoje
      </span>,
    );
  }
  if (projectedTotal != null) {
    parts.push(
      <span key="proj">
        Fechamento previsto: <strong className="tabular font-medium text-zinc-700 dark:text-zinc-300">{brl(projectedTotal)}</strong>
        {budget != null && (
          <span className={projectedTotal > budget ? 'text-red-500' : 'text-emerald-600'}>
            {' '}({projectedTotal > budget ? 'acima' : 'dentro'} do orçamento de {brl(budget)})
          </span>
        )}
      </span>,
    );
  } else if (budget != null) {
    const spent = data.summary.expense;
    parts.push(
      <span key="budget" className={spent > budget ? 'text-red-500' : 'text-emerald-600'}>
        {brl(spent)} de {brl(budget)} orçados ({Math.round((spent / budget) * 100)}%)
      </span>,
    );
  }
  if (!parts.length) return budget == null ? <p className="-mt-2 mb-3 text-xs text-zinc-500">Defina orçamentos nas categorias para comparar o ritmo de gastos.</p> : null;
  return <p className="-mt-2 mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">{parts}</p>;
}

/** Destaques do período: maior despesa, maior receita e meses no vermelho. */
function TrendSummary({ trend }: { trend: Dashboard['trend'] }) {
  const withData = trend.filter((t) => t.income || t.expense);
  if (!withData.length) return null;
  const maxBy = (k: 'income' | 'expense') => withData.reduce((a, t) => (t[k] > a[k] ? t : a));
  const topExpense = maxBy('expense');
  const topIncome = maxBy('income');
  const negative = withData.filter((t) => t.balance < 0);
  const total = withData.reduce((a, t) => a + t.balance, 0);
  return (
    <div className="-mt-2 mb-3 flex flex-wrap gap-1.5 text-xs">
      {topExpense.expense > 0 && <Badge tone="red">Mais gasto: {monthShort(topExpense.month)}</Badge>}
      {topIncome.income > 0 && <Badge tone="green">Mais recebido: {monthShort(topIncome.month)}</Badge>}
      <Badge tone={negative.length ? 'amber' : 'neutral'}>
        {negative.length ? `No vermelho: ${negative.map((t) => monthShort(t.month)).join(', ')}` : 'Nenhum mês no vermelho'}
      </Badge>
      <Badge tone={total < 0 ? 'red' : 'blue'}>Saldo do período: {brl(total)}</Badge>
    </div>
  );
}

type RecentFilter = 'ALL' | 'INCOME' | 'EXPENSE';

/** Transações recentes com filtro rápido e situação (paga, agendada, na fatura). */
function RecentTransactions({ month, all, onOpen }: { month: string; all: Transaction[]; onOpen: (t: Transaction) => void }) {
  const [filter, setFilter] = useState<RecentFilter>('ALL');
  const { from, to } = monthBounds(month);
  // filtros por tipo reutilizam a listagem de transações (6 mais recentes do tipo no mês)
  const { data: filtered, isLoading } = useQuery({
    queryKey: ['transactions', 'recent', month, filter],
    queryFn: () => api.get<TransactionList>(`/transactions${qs({ from, to, type: filter, pageSize: 6, sort: 'date', order: 'desc' })}`),
    enabled: filter !== 'ALL',
  });
  // mesma consulta do card da fatura (cache compartilhado)
  const { data: inv } = useQuery({
    queryKey: ['transactions', 'invoice', month],
    queryFn: () => api.get<Invoice>(`/transactions/invoice${qs({ month })}`),
  });
  const items = filter === 'ALL' ? all : filtered?.items;
  const today = todayISO();

  const badges = (t: Transaction) => {
    const isBill = inv?.payment?.id === t.id;
    const status = isBill ? (
      <Badge tone="blue">Pagamento de fatura</Badge>
    ) : t.paymentMethod === 'CREDIT_CARD' ? (
      inv?.payment ? <Badge tone="green">Fatura paga</Badge> : <Badge tone="amber">Fatura em aberto</Badge>
    ) : t.date > today ? (
      <Badge tone="amber">Agendada</Badge>
    ) : (
      <Badge tone="green">{t.type === 'INCOME' ? 'Recebida' : 'Paga'}</Badge>
    );
    return (
      <>
        <Badge tone={t.type === 'INCOME' ? 'green' : 'red'}>{t.type === 'INCOME' ? 'Receita' : 'Despesa'}</Badge>
        {status}
        {t.installmentTotal != null && t.installmentTotal > 1 && <Badge>Parcelada {t.installmentNumber}/{t.installmentTotal}</Badge>}
        {t.source === 'RECURRING' && <Badge tone="blue"><Repeat className="mr-1 h-3 w-3" />Recorrente</Badge>}
      </>
    );
  };

  return (
    <>
      <div className="mb-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'Todas' },
            { value: 'INCOME', label: 'Receitas' },
            { value: 'EXPENSE', label: 'Despesas' },
          ]}
        />
      </div>
      {!items && isLoading ? (
        <Spinner className="py-10" />
      ) : items?.length ? (
        <div className="-mx-2">
          {items.map((t) => (
            <TransactionRow key={t.id} tx={t} onClick={() => onOpen(t)} badges={badges(t)} />
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-zinc-500">Nenhuma {filter === 'INCOME' ? 'receita' : 'despesa'} neste mês.</p>
      )}
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
