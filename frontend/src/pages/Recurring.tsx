import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Plus, Repeat, Send } from 'lucide-react';
import { api } from '../lib/api';
import { brl, cn, PAYMENT_LABELS, todayISO } from '../lib/format';
import type { PaymentMethod, Recurring, TxType } from '../lib/types';
import { useCategories, useInvalidateFinance } from '../hooks/queries';
import { Badge, Card, Empty, PageHeader, Spinner } from '../components/ui/misc';
import { Button, Field, Input, MoneyInput, Segmented, Select } from '../components/ui/controls';
import { Modal } from '../components/ui/Modal';
import { CategoryIcon } from '../components/CategoryIcon';
import { useToast } from '../components/ui/Toast';

const blank = {
  type: 'EXPENSE' as TxType,
  description: '',
  amount: '',
  dayOfMonth: '10',
  categoryId: '',
  paymentMethod: 'BOLETO' as PaymentMethod,
  active: true,
  startDate: todayISO(),
  endDate: '',
};

export function RecurringPage() {
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [form, setForm] = useState(blank);
  const { data: categories = [] } = useCategories(form.type);
  const { data = [], isLoading } = useQuery({ queryKey: ['recurring'], queryFn: () => api.get<Recurring[]>('/recurring') });

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            type: editing.type,
            description: editing.description,
            amount: String(editing.amount),
            dayOfMonth: String(editing.dayOfMonth),
            categoryId: editing.categoryId ?? '',
            paymentMethod: editing.paymentMethod,
            active: editing.active,
            startDate: editing.startDate,
            endDate: editing.endDate ?? '',
          }
        : blank,
    );
  }, [open, editing]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        amount: Number(form.amount.replace(',', '.')),
        dayOfMonth: Number(form.dayOfMonth),
        categoryId: form.categoryId || null,
        endDate: form.endDate || null,
      };
      return editing ? api.put(`/recurring/${editing.id}`, body) : api.post('/recurring', body);
    },
    onSuccess: async () => {
      setOpen(false);
      await invalidate();
      toast('Conta fixa salva');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/recurring/${id}`),
    onSuccess: async () => {
      setOpen(false);
      await invalidate();
      toast('Conta fixa removida');
    },
  });

  const launch = useMutation({
    mutationFn: (id: string) => api.post(`/recurring/${id}/launch`),
    onSuccess: async () => {
      await invalidate();
      toast('Lançada nas transações do mês');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const expenses = data.filter((r) => r.type === 'EXPENSE' && r.activeThisMonth);
  const incomes = data.filter((r) => r.type === 'INCOME' && r.activeThisMonth);
  const sum = (l: Recurring[]) => l.reduce((a, r) => a + r.amount, 0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <PageHeader
        title="Contas fixas"
        subtitle="Aluguel, assinaturas, contas de consumo e rendas extras recorrentes. Usadas no salário comprometido e nas previsões."
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Nova conta fixa
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-zinc-500">Despesas fixas / mês</p>
          <p className="tabular mt-2 text-2xl font-semibold">{brl(sum(expenses))}</p>
        </Card>
        <Card>
          <p className="text-sm text-zinc-500">Receitas recorrentes / mês</p>
          <p className="tabular mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{brl(sum(incomes))}</p>
        </Card>
        <Card>
          <p className="text-sm text-zinc-500">Pendentes de lançar este mês</p>
          <p className="tabular mt-2 text-2xl font-semibold">{data.filter((r) => r.activeThisMonth && !r.launchedThisMonth).length}</p>
        </Card>
      </div>

      <Card className="p-2">
        {isLoading ? (
          <Spinner />
        ) : !data.length ? (
          <Empty icon={Repeat} title="Nenhuma conta fixa" description="Cadastre aluguel, internet, academia, assinaturas e outras contas que se repetem todo mês." />
        ) : (
          <ul>
            {data.map((r) => (
              <li key={r.id} className={cn('flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50', !r.activeThisMonth && 'opacity-50')}>
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => { setEditing(r); setOpen(true); }}>
                  <CategoryIcon icon={r.category?.icon} color={r.category?.color} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.description}</p>
                    <p className="truncate text-xs text-zinc-500">
                      Todo dia {r.dayOfMonth} · {PAYMENT_LABELS[r.paymentMethod]}
                      {r.endDate && ` · até ${r.endDate.split('-').reverse().join('/')}`}
                    </p>
                  </div>
                </button>
                {!r.active && <Badge>Pausada</Badge>}
                <span className={cn('tabular text-sm font-semibold', r.type === 'INCOME' && 'text-emerald-600 dark:text-emerald-400')}>{brl(r.amount)}</span>
                {r.activeThisMonth &&
                  (r.launchedThisMonth ? (
                    <span className="flex h-8 w-8 items-center justify-center text-emerald-500" title="Lançada este mês">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : (
                    <Button variant="ghost" size="icon" title="Lançar neste mês" onClick={() => launch.mutate(r.id)}>
                      <Send className="h-4 w-4" />
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar conta fixa' : 'Nova conta fixa'}
        footer={
          <>
            {editing && (
              <Button variant="ghost" className="mr-auto text-red-600" onClick={() => confirm('Remover esta conta fixa?') && remove.mutate(editing.id)}>
                Remover
              </Button>
            )}
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form="rec-form" loading={save.isPending}>Salvar</Button>
          </>
        }
      >
        <form id="rec-form" onSubmit={submit} className="flex flex-col gap-4">
          <Segmented value={form.type} onChange={(v) => setForm((f) => ({ ...f, type: v, categoryId: '' }))} options={[{ value: 'EXPENSE', label: 'Despesa' }, { value: 'INCOME', label: 'Receita' }]} />
          <Field label="Descrição">
            <Input required value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Ex.: Aluguel, Netflix, Internet" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor">
              <MoneyInput required value={form.amount} onChange={(v) => set('amount', v)} />
            </Field>
            <Field label="Dia do vencimento">
              <Input required type="number" min={1} max={31} value={form.dayOfMonth} onChange={(e) => set('dayOfMonth', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria">
              <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Pagamento">
              <Select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value as PaymentMethod)}>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início">
              <Input required type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            <Field label="Término (opcional)">
              <Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-zinc-900" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            Ativa
          </label>
        </form>
      </Modal>
    </>
  );
}
