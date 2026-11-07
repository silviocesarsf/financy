import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Pencil, Plus, Target } from 'lucide-react';
import { api } from '../lib/api';
import { brl, dateBR } from '../lib/format';
import type { Goal } from '../lib/types';
import { Card, Empty, PageHeader, Progress, Spinner } from '../components/ui/misc';
import { Button, Field, Input, MoneyInput } from '../components/ui/controls';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

const COLORS = ['#10b981', '#3b82f6', '#a855f7', '#f97316', '#ec4899', '#eab308', '#14b8a6', '#64748b'];
const blank = { name: '', targetAmount: '', currentAmount: '0', deadline: '', color: COLORS[0] };

export function GoalsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [form, setForm] = useState(blank);
  const [contrib, setContrib] = useState<{ goal: Goal; sign: 1 | -1 } | null>(null);
  const [contribValue, setContribValue] = useState('');
  const { data = [], isLoading } = useQuery({ queryKey: ['goals'], queryFn: () => api.get<Goal[]>('/goals') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['goals'] });

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? { name: editing.name, targetAmount: String(editing.targetAmount), currentAmount: String(editing.currentAmount), deadline: editing.deadline ?? '', color: editing.color }
        : blank,
    );
  }, [open, editing]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        targetAmount: Number(form.targetAmount.replace(',', '.')),
        currentAmount: Number(form.currentAmount.replace(',', '.')) || 0,
        deadline: form.deadline || null,
        color: form.color,
      };
      return editing ? api.put(`/goals/${editing.id}`, body) : api.post('/goals', body);
    },
    onSuccess: async () => {
      setOpen(false);
      await refresh();
      toast('Meta salva');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/goals/${id}`),
    onSuccess: async () => {
      setOpen(false);
      await refresh();
    },
  });

  const contribute = useMutation({
    mutationFn: () => api.post(`/goals/${contrib!.goal.id}/contribute`, { amount: contrib!.sign * Number(contribValue.replace(',', '.')) }),
    onSuccess: async () => {
      setContrib(null);
      setContribValue('');
      await refresh();
      toast('Meta atualizada');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <>
      <PageHeader
        title="Metas"
        subtitle="Defina objetivos e acompanhe quanto falta para alcançá-los."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Nova meta</Button>}
      />

      {isLoading ? (
        <Spinner />
      ) : !data.length ? (
        <Card>
          <Empty icon={Target} title="Nenhuma meta criada" description="Reserva de emergência, viagem, troca de carro... crie sua primeira meta." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((g) => (
            <Card key={g.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${g.color}1f`, color: g.color }}>
                    <Target className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{g.name}</p>
                    {g.deadline && <p className="text-xs text-zinc-500">até {dateBR(g.deadline)}</p>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => { setEditing(g); setOpen(true); }} aria-label="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="tabular text-xl font-semibold">{brl(g.currentAmount)}</span>
                  <span className="tabular text-sm text-zinc-500">de {brl(g.targetAmount)}</span>
                </div>
                <Progress value={g.progress} color={g.color} />
                <p className="mt-2 text-xs text-zinc-500">
                  {g.progress}% concluído
                  {g.monthlyNeeded != null && g.progress < 100 && ` · guarde ${brl(g.monthlyNeeded)}/mês`}
                </p>
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" onClick={() => setContrib({ goal: g, sign: -1 })}><Minus className="h-3.5 w-3.5" /> Retirar</Button>
                <Button size="sm" onClick={() => setContrib({ goal: g, sign: 1 })}><Plus className="h-3.5 w-3.5" /> Guardar</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar meta' : 'Nova meta'}
        footer={
          <>
            {editing && <Button variant="ghost" className="mr-auto text-red-600" onClick={() => confirm('Excluir meta?') && remove.mutate(editing.id)}>Excluir</Button>}
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" form="goal-form" loading={save.isPending}>Salvar</Button>
          </>
        }
      >
        <form id="goal-form" onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nome"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Reserva de emergência" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor alvo"><MoneyInput required value={form.targetAmount} onChange={(v) => setForm({ ...form, targetAmount: v })} /></Field>
            <Field label="Já guardado"><MoneyInput value={form.currentAmount} onChange={(v) => setForm({ ...form, currentAmount: v })} /></Field>
          </div>
          <Field label="Prazo (opcional)"><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
          <Field label="Cor">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button type="button" key={c} onClick={() => setForm({ ...form, color: c })} className="h-8 w-8 rounded-full ring-offset-2 dark:ring-offset-zinc-900" style={{ background: c, boxShadow: form.color === c ? `0 0 0 2px ${c}` : undefined }} aria-label={c} />
              ))}
            </div>
          </Field>
        </form>
      </Modal>

      <Modal
        open={!!contrib}
        onClose={() => setContrib(null)}
        title={contrib?.sign === 1 ? `Guardar em ${contrib?.goal.name}` : `Retirar de ${contrib?.goal.name}`}
        footer={<Button loading={contribute.isPending} disabled={!Number(contribValue.replace(',', '.'))} onClick={() => contribute.mutate()}>Confirmar</Button>}
      >
        <Field label="Valor"><MoneyInput autoFocus value={contribValue} onChange={setContribValue} /></Field>
      </Modal>
    </>
  );
}
