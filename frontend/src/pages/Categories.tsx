import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { brl, cn } from '../lib/format';
import type { Category, TxType } from '../lib/types';
import { useCategories } from '../hooks/queries';
import { PageHeader, Spinner } from '../components/ui/misc';
import { Button, Field, Input, MoneyInput, Segmented } from '../components/ui/controls';
import { Modal } from '../components/ui/Modal';
import { CATEGORY_ICONS, CategoryIcon } from '../components/CategoryIcon';
import { useToast } from '../components/ui/Toast';

const COLORS = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ef4444', '#eab308', '#14b8a6', '#6366f1', '#0ea5e9', '#64748b', '#d97706', '#10b981', '#94a3b8'];

export function CategoriesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TxType>('EXPENSE');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', color: COLORS[0], icon: 'circle-dashed', keywords: '', monthlyBudget: '' });
  const { data = [], isLoading } = useCategories(tab);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? { name: editing.name, color: editing.color, icon: editing.icon, keywords: editing.keywords.join(', '), monthlyBudget: editing.monthlyBudget ? String(editing.monthlyBudget) : '' }
        : { name: '', color: COLORS[0], icon: 'circle-dashed', keywords: '', monthlyBudget: '' },
    );
  }, [open, editing]);

  const invalidate = () => Promise.all(['categories', 'dashboard', 'insights'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        color: form.color,
        icon: form.icon,
        type: tab,
        keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
        monthlyBudget: Number(form.monthlyBudget.replace(',', '.')) || null,
      };
      return editing ? api.put(`/categories/${editing.id}`, body) : api.post('/categories', body);
    },
    onSuccess: async () => {
      setOpen(false);
      await invalidate();
      toast('Categoria salva');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/categories/${id}`),
    onSuccess: async () => {
      setOpen(false);
      await invalidate();
      toast('Categoria removida');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <>
      <PageHeader
        title="Categorias"
        subtitle="Personalize categorias, orçamentos mensais e palavras-chave da categorização automática."
        actions={
          <>
            <Segmented value={tab} onChange={setTab} options={[{ value: 'EXPENSE', label: 'Despesas' }, { value: 'INCOME', label: 'Receitas' }]} />
            <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Nova</Button>
          </>
        }
      />

      {isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <button key={c.id} onClick={() => { setEditing(c); setOpen(true); }} className="card flex items-center gap-3 p-4 text-left transition hover:border-zinc-300 dark:hover:border-zinc-700">
              <CategoryIcon icon={c.icon} color={c.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.name}</p>
                <p className="truncate text-xs text-zinc-500">{c.keywords.length ? c.keywords.slice(0, 4).join(', ') : 'Sem palavras-chave'}</p>
              </div>
              {c.monthlyBudget && <span className="tabular text-xs text-zinc-500">{brl(c.monthlyBudget)}</span>}
            </button>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar categoria' : 'Nova categoria'}
        footer={
          <>
            {editing && (
              <Button variant="ghost" className="mr-auto text-red-600" onClick={() => confirm('Excluir categoria? As transações ficarão sem categoria.') && remove.mutate(editing.id)}>
                Excluir
              </Button>
            )}
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form="cat-form" loading={save.isPending}>Salvar</Button>
          </>
        }
      >
        <form id="cat-form" onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <CategoryIcon icon={form.icon} color={form.color} />
            <Field label="Nome" className="flex-1"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          </div>
          <Field label="Cor">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button type="button" key={c} onClick={() => setForm({ ...form, color: c })} className="h-7 w-7 rounded-full" style={{ background: c, boxShadow: form.color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : undefined }} aria-label={c} />
              ))}
            </div>
          </Field>
          <Field label="Ícone">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setForm({ ...form, icon: key })}
                  className={cn('flex h-9 w-9 items-center justify-center rounded-lg border transition', form.icon === key ? 'border-zinc-900 dark:border-white' : 'border-zinc-200 text-zinc-500 dark:border-zinc-800')}
                  aria-label={key}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </Field>
          {tab === 'EXPENSE' && (
            <Field label="Orçamento mensal (opcional)">
              <MoneyInput value={form.monthlyBudget} onChange={(v) => setForm({ ...form, monthlyBudget: v })} />
            </Field>
          )}
          <Field label="Palavras-chave" hint="Separe por vírgula. Usadas para categorizar importações automaticamente.">
            <Input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="ifood, restaurante, padaria" />
          </Field>
        </form>
      </Modal>
    </>
  );
}
