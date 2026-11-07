import { useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileUp, History, Trash2, Undo2 } from 'lucide-react';
import { api } from '../lib/api';
import { brl, cn, dateBR, SOURCE_LABELS } from '../lib/format';
import type { ImportBatch, ImportItem, ImportPreview } from '../lib/types';
import { useCategories, useInvalidateFinance } from '../hooks/queries';
import { Badge, Card, CardTitle, Empty, PageHeader } from '../components/ui/misc';
import { Button, Field, Input, Select } from '../components/ui/controls';
import { useToast } from '../components/ui/Toast';

export function ImportPage() {
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [dueDate, setDueDate] = useState('');
  const { data: categories = [] } = useCategories();
  const { data: history = [] } = useQuery({ queryKey: ['imports'], queryFn: () => api.get<ImportBatch[]>('/imports') });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post<ImportPreview>('/imports/preview', fd);
    },
    onSuccess: (p) => {
      setPreview(p);
      setItems(p.items);
      setDueDate(p.dueDate ?? '');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const confirmImport = useMutation({
    mutationFn: () =>
      api.post<{ imported: number; skipped: number }>('/imports/confirm', {
        fileName: preview!.fileName,
        source: preview!.source,
        dueDate: preview!.isCardInvoice && dueDate ? dueDate : null,
        items: items
          .filter((i) => i.selected)
          .map(({ date, description, amount, type, paymentMethod, categoryId, installmentNumber, installmentTotal, fingerprint }) => ({
            date, description, amount, type, paymentMethod, categoryId, installmentNumber, installmentTotal, fingerprint,
          })),
      }),
    onSuccess: async (r) => {
      setPreview(null);
      setItems([]);
      await invalidate();
      toast(`${r.imported} transações importadas${r.skipped ? ` (${r.skipped} duplicadas ignoradas)` : ''}`);
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const undo = useMutation({
    mutationFn: (id: string) => api.del(`/imports/${id}`),
    onSuccess: async () => {
      await invalidate();
      toast('Importação desfeita');
    },
  });

  const onFile = (file?: File) => file && upload.mutate(file);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFile(e.dataTransfer.files[0]);
  };
  const update = (idx: number, patch: Partial<ImportItem>) => setItems((s) => s.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const chosen = items.filter((i) => i.selected);
  const totalExpense = chosen.filter((i) => i.type === 'EXPENSE').reduce((a, i) => a + i.amount, 0);
  const allChecked = items.length > 0 && items.every((i) => i.selected);

  return (
    <>
      <PageHeader title="Importar fatura" subtitle="Importe a fatura do cartão ou o extrato da conta Nubank. As transações são categorizadas automaticamente." />

      {!preview ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-16 text-center transition',
                dragging ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/5' : 'hover:border-zinc-300 dark:hover:border-zinc-700',
              )}
            >
              <div className="mb-4 rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-800">
                <FileUp className={cn('h-7 w-7 text-zinc-500', upload.isPending && 'animate-bounce')} />
              </div>
              <p className="font-medium">{upload.isPending ? 'Lendo arquivo...' : 'Arraste o arquivo aqui ou clique para selecionar'}</p>
              <p className="mt-1 text-sm text-zinc-500">CSV, OFX ou PDF · até 5MB</p>
              <input ref={inputRef} type="file" accept=".csv,.ofx,.pdf" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>

            <Card className="mt-4">
              <CardTitle>Como exportar do Nubank</CardTitle>
              <ol className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <li><b className="text-zinc-900 dark:text-zinc-100">Fatura do cartão (recomendado):</b> app.nubank.com.br → Cartão de crédito → escolha a fatura → “Exportar para CSV” ou envie o PDF da fatura recebido por e-mail.</li>
                <li><b className="text-zinc-900 dark:text-zinc-100">Extrato da conta:</b> app Nubank → Conta → ícone de extrato → “Exportar extrato” (CSV ou OFX).</li>
                <li>Pagamentos de fatura, aplicações e estornos vêm desmarcados para não duplicar valores. Reimportar o mesmo arquivo não gera duplicatas.</li>
              </ol>
            </Card>
          </div>

          <Card>
            <CardTitle>
              <span className="flex items-center gap-2"><History className="h-4 w-4" /> Histórico</span>
            </CardTitle>
            {history.length ? (
              <ul className="space-y-1">
                {history.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.fileName}</p>
                      <p className="text-xs text-zinc-500">
                        {SOURCE_LABELS[b.source]} · {b.totalItems} itens · {new Date(b.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Desfazer importação"
                      onClick={() => confirm(`Desfazer importação e remover ${b.totalItems} transações?`) && undo.mutate(b.id)}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-500">Nenhuma importação ainda.</p>
            )}
          </Card>
        </div>
      ) : (
        <Card className="p-0">
          <div className="flex flex-col gap-3 border-b border-zinc-100 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <div>
              <p className="font-semibold">{preview.label}</p>
              <p className="text-sm text-zinc-500">
                {chosen.length} de {items.length} selecionadas · {brl(totalExpense)} em despesas
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {preview.isCardInvoice && (
                <Field label="Vencimento da fatura" hint="As compras contam neste mês">
                  <Input type="date" required className="h-10" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </Field>
              )}
              <Button variant="secondary" onClick={() => setPreview(null)}>
                <Trash2 className="h-4 w-4" /> Descartar
              </Button>
              <Button disabled={!chosen.length || (preview.isCardInvoice && !dueDate)} loading={confirmImport.isPending} onClick={() => confirmImport.mutate()}>
                <CheckCircle2 className="h-4 w-4" /> Importar {chosen.length}
              </Button>
            </div>
          </div>

          {items.length === 0 ? (
            <Empty icon={FileUp} title="Nenhum lançamento encontrado no arquivo" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800">
                    <th className="w-10 py-3 pl-5">
                      <input type="checkbox" className="accent-zinc-900" checked={allChecked} onChange={() => setItems((s) => s.map((i) => ({ ...i, selected: !allChecked })))} />
                    </th>
                    <th className="py-3 font-medium">Data</th>
                    <th className="py-3 font-medium">Descrição</th>
                    <th className="py-3 font-medium">Categoria</th>
                    <th className="py-3 pr-5 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.fingerprint} className={cn('border-b border-zinc-50 last:border-0 dark:border-zinc-800/60', !it.selected && 'opacity-50')}>
                      <td className="py-2.5 pl-5">
                        <input type="checkbox" className="accent-zinc-900" checked={it.selected} onChange={() => update(idx, { selected: !it.selected })} />
                      </td>
                      <td className="tabular py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-300">{dateBR(it.date)}</td>
                      <td className="max-w-xs py-2.5 pr-3">
                        <p className="truncate">{it.description}</p>
                        <div className="mt-0.5 flex gap-1">
                          {it.duplicate && <Badge tone="amber">Já importada</Badge>}
                          {it.installmentTotal && <Badge tone="blue">Parcela {it.installmentNumber}/{it.installmentTotal}</Badge>}
                          {it.type === 'INCOME' && <Badge tone="green">Entrada</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Select className="h-8 min-w-40 text-xs" value={it.categoryId ?? ''} onChange={(e) => update(idx, { categoryId: e.target.value || null })}>
                          <option value="">Sem categoria</option>
                          {categories
                            .filter((c) => c.type === it.type)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </Select>
                      </td>
                      <td className={cn('tabular py-2.5 pr-5 text-right font-medium whitespace-nowrap', it.type === 'INCOME' && 'text-emerald-600 dark:text-emerald-400')}>
                        {it.type === 'INCOME' ? '+' : '−'} {brl(it.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
