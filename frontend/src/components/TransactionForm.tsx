import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api, qs } from '../lib/api';
import { PAYMENT_LABELS, brl, todayISO } from '../lib/format';
import type { PaymentMethod, Transaction, TxType } from '../lib/types';
import { useCategories, useDebounced, useInvalidateFinance } from '../hooks/queries';
import { Modal } from './ui/Modal';
import { Button, Field, Input, MoneyInput, Segmented, Select } from './ui/controls';
import { useToast } from './ui/Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  transaction?: Transaction | null;
  defaultType?: TxType;
}

const empty = (type: TxType) => ({
  type,
  description: '',
  amount: '',
  date: todayISO(),
  categoryId: '',
  paymentMethod: (type === 'EXPENSE' ? 'CREDIT_CARD' : 'PIX') as PaymentMethod,
  notes: '',
  installments: '1',
});

export function TransactionForm({ open, onClose, transaction, defaultType = 'EXPENSE' }: Props) {
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const [form, setForm] = useState(empty(defaultType));
  const [categoryTouched, setCategoryTouched] = useState(false);
  const { data: categories = [] } = useCategories(form.type);
  const editing = !!transaction;

  useEffect(() => {
    if (!open) return;
    setCategoryTouched(!!transaction);
    setForm(
      transaction
        ? {
            type: transaction.type,
            description: transaction.description,
            amount: String(transaction.amount),
            date: transaction.date,
            categoryId: transaction.categoryId ?? '',
            paymentMethod: transaction.paymentMethod,
            notes: transaction.notes ?? '',
            installments: '1',
          }
        : empty(defaultType),
    );
  }, [open, transaction, defaultType]);

  // sugestão automática de categoria enquanto digita
  const debouncedDesc = useDebounced(form.description, 500);
  useEffect(() => {
    if (categoryTouched || debouncedDesc.trim().length < 3) return;
    api
      .get<{ categoryId: string | null }>(`/transactions/suggest-category${qs({ description: debouncedDesc, type: form.type })}`)
      .then((r) => r.categoryId && setForm((f) => ({ ...f, categoryId: r.categoryId! })))
      .catch(() => {});
  }, [debouncedDesc, form.type, categoryTouched]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        type: form.type,
        description: form.description,
        amount: Number(form.amount.replace(',', '.')),
        date: form.date,
        categoryId: form.categoryId || null,
        paymentMethod: form.paymentMethod,
        notes: form.notes || null,
        ...(!editing && Number(form.installments) > 1 && { installments: Number(form.installments) }),
      };
      return editing ? api.put(`/transactions/${transaction!.id}`, body) : api.post('/transactions', body);
    },
    onSuccess: async () => {
      await invalidate();
      toast(editing ? 'Transação atualizada' : 'Transação adicionada');
      onClose();
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/transactions/${transaction!.id}`),
    onSuccess: async () => {
      await invalidate();
      toast('Transação excluída');
      onClose();
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const installments = Number(form.installments);
  const amount = Number(form.amount.replace(',', '.')) || 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar transação' : 'Nova transação'}
      footer={
        <>
          {editing && (
            <Button
              variant="ghost"
              className="mr-auto text-red-600 dark:text-red-400"
              loading={remove.isPending}
              onClick={() => confirm('Excluir esta transação?') && remove.mutate()}
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="tx-form" loading={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="tx-form" onSubmit={submit} className="flex flex-col gap-4">
        <Segmented
          value={form.type}
          onChange={(v) => setForm((f) => ({ ...f, type: v, categoryId: '' }))}
          options={[
            { value: 'EXPENSE', label: 'Despesa' },
            { value: 'INCOME', label: 'Receita' },
          ]}
        />
        <Field label="Descrição">
          <Input required autoFocus value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Ex.: Mercado, Uber, Salário" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={installments > 1 ? 'Valor total' : 'Valor'}>
            <MoneyInput required value={form.amount} onChange={(v) => set('amount', v)} />
          </Field>
          <Field label={installments > 1 ? 'Data da 1ª parcela' : 'Data'}>
            <Input required type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <Select
              value={form.categoryId}
              onChange={(e) => {
                setCategoryTouched(true);
                set('categoryId', e.target.value);
              }}
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pagamento">
            <Select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!editing && form.type === 'EXPENSE' && (
          <Field
            label="Parcelas"
            hint={installments > 1 && amount > 0 ? `${installments}x de ${brl(amount / installments)} — lançadas mês a mês` : undefined}
          >
            <Select value={form.installments} onChange={(e) => set('installments', e.target.value)}>
              <option value="1">À vista</option>
              {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Observações">
          <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Opcional" />
        </Field>
      </form>
    </Modal>
  );
}
