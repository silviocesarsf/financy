import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDownUp, ChevronLeft, ChevronRight, Plus, Search, SearchX, Tag, Trash2 } from 'lucide-react';
import { api, qs } from '../lib/api';
import { brl, cn, currentMonth, dateBR, monthBounds, PAYMENT_LABELS, SOURCE_LABELS } from '../lib/format';
import type { Transaction, TransactionList } from '../lib/types';
import { useCategories, useDebounced, useInvalidateFinance } from '../hooks/queries';
import { Badge, Card, Empty, PageHeader, Spinner } from '../components/ui/misc';
import { Button, Input, Select } from '../components/ui/controls';
import { CategoryIcon } from '../components/CategoryIcon';
import { TransactionForm } from '../components/TransactionForm';
import { TransactionRow } from '../components/TransactionRow';
import { useToast } from '../components/ui/Toast';

type Sort = 'date' | 'amount' | 'description';

export function TransactionsPage() {
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const { data: categories = [] } = useCategories();
  const initial = monthBounds(currentMonth());

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ from: initial.from, to: initial.to, type: '', categoryId: '', paymentMethod: '' });
  const [sort, setSort] = useState<{ by: Sort; order: 'asc' | 'desc' }>({ by: 'date', order: 'desc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const q = useDebounced(search);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [q, filters, sort]);

  const params = { q, ...filters, page, pageSize: 25, sort: sort.by, order: sort.order };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['transactions', params],
    queryFn: () => api.get<TransactionList>(`/transactions${qs(params)}`),
    placeholderData: keepPreviousData,
  });

  const bulkDelete = useMutation({
    mutationFn: () => api.post<{ count: number }>('/transactions/bulk-delete', { ids: [...selected] }),
    onSuccess: async (r) => {
      setSelected(new Set());
      await invalidate();
      toast(`${r.count} transação(ões) excluída(s)`);
    },
  });

  const bulkCategory = useMutation({
    mutationFn: (categoryId: string) =>
      api.post<{ count: number }>('/transactions/bulk-category', { ids: [...selected], categoryId: categoryId || null }),
    onSuccess: async (r) => {
      setSelected(new Set());
      await invalidate();
      toast(`${r.count} transação(ões) recategorizada(s)`);
    },
  });

  const totalPages = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1;
  const allSelected = !!data?.items.length && data.items.every((t) => selected.has(t.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleSort = (by: Sort) => setSort((s) => ({ by, order: s.by === by && s.order === 'desc' ? 'asc' : 'desc' }));
  const open = (tx: Transaction | null) => {
    setEditing(tx);
    setFormOpen(true);
  };
  const setFilter = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <>
      <PageHeader
        title="Transações"
        subtitle="Pesquise, filtre e organize suas despesas e receitas."
        actions={
          <Button onClick={() => open(null)}>
            <Plus className="h-4 w-4" /> Nova transação
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por descrição..." className="pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} aria-label="De" />
          <Input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} aria-label="Até" />
          <Select value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
            <option value="">Todos os tipos</option>
            <option value="EXPENSE">Despesas</option>
            <option value="INCOME">Receitas</option>
          </Select>
          <Select value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)}>
            <option value="">Todas categorias</option>
            <option value="none">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={filters.paymentMethod} onChange={(e) => setFilter('paymentMethod', e.target.value)} className="col-span-2 md:col-span-1">
            <option value="">Todos pagamentos</option>
            {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-zinc-500">
            {data?.total ?? 0} resultado(s)
          </span>
          <span>
            Despesas <b className="tabular">{brl(data?.totals.expense ?? 0)}</b>
          </span>
          <span>
            Receitas <b className="tabular text-emerald-600 dark:text-emerald-400">{brl(data?.totals.income ?? 0)}</b>
          </span>
          <button
            className="ml-auto text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            onClick={() => {
              setSearch('');
              setFilters({ from: '', to: '', type: '', categoryId: '', paymentMethod: '' });
            }}
          >
            Limpar filtros
          </button>
        </div>
      </Card>

      {selected.size > 0 && (
        <div className="sticky top-16 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg lg:top-4 dark:bg-white dark:text-zinc-900">
          <span className="font-medium">{selected.size} selecionada(s)</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Tag className="h-4 w-4 opacity-70" />
              <select
                className="h-8 rounded-lg bg-white/10 px-2 text-xs outline-none dark:bg-zinc-100"
                defaultValue="__"
                onChange={(e) => {
                  if (e.target.value !== '__') bulkCategory.mutate(e.target.value);
                  e.target.value = '__';
                }}
              >
                <option value="__" disabled>
                  Alterar categoria
                </option>
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id} className="text-zinc-900">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              variant="danger"
              loading={bulkDelete.isPending}
              onClick={() => confirm(`Excluir ${selected.size} transação(ões)?`) && bulkDelete.mutate()}
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
          </div>
        </div>
      )}

      <Card className={cn('p-0 transition-opacity', isFetching && 'opacity-70')}>
        {isLoading ? (
          <Spinner />
        ) : !data?.items.length ? (
          <Empty icon={SearchX} title="Nenhuma transação encontrada" description="Ajuste os filtros ou cadastre uma nova transação." />
        ) : (
          <>
            {/* Mobile */}
            <div className="p-2 md:hidden">
              {data.items.map((t) => (
                <TransactionRow key={t.id} tx={t} onClick={() => open(t)} />
              ))}
            </div>

            {/* Desktop */}
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="w-10 py-3 pl-5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(data.items.map((t) => t.id)))}
                      className="accent-zinc-900"
                    />
                  </th>
                  <SortTh label="Descrição" active={sort.by === 'description'} onClick={() => toggleSort('description')} />
                  <th className="py-3 font-medium">Categoria</th>
                  <SortTh label="Data" active={sort.by === 'date'} onClick={() => toggleSort('date')} />
                  <th className="py-3 font-medium">Pagamento</th>
                  <SortTh label="Valor" active={sort.by === 'amount'} onClick={() => toggleSort('amount')} className="pr-5 text-right" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr
                    key={t.id}
                    className={cn(
                      'cursor-pointer border-b border-zinc-50 last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40',
                      selected.has(t.id) && 'bg-zinc-50 dark:bg-zinc-800/40',
                    )}
                    onClick={() => open(t)}
                  >
                    <td className="py-3 pl-5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="accent-zinc-900" />
                    </td>
                    <td className="max-w-xs py-3">
                      <p className="truncate font-medium">{t.description}</p>
                      <div className="mt-0.5 flex gap-1">
                        {t.source !== 'MANUAL' && <Badge>{SOURCE_LABELS[t.source]}</Badge>}
                        {t.installmentTotal && <Badge tone="blue">{t.installmentNumber}/{t.installmentTotal}</Badge>}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <CategoryIcon icon={t.category?.icon} color={t.category?.color} size="sm" />
                        <span className="truncate text-zinc-600 dark:text-zinc-300">{t.category?.name ?? 'Sem categoria'}</span>
                      </div>
                    </td>
                    <td className="tabular py-3 text-zinc-600 dark:text-zinc-300">
                      {dateBR(t.purchaseDate ?? t.date)}
                      {t.purchaseDate && <p className="text-[11px] text-zinc-400">fatura {dateBR(t.date).slice(0, 5)}</p>}
                    </td>
                    <td className="py-3 text-zinc-600 dark:text-zinc-300">{PAYMENT_LABELS[t.paymentMethod]}</td>
                    <td className={cn('tabular py-3 pr-5 text-right font-semibold', t.type === 'INCOME' && 'text-emerald-600 dark:text-emerald-400')}>
                      {t.type === 'INCOME' ? '+' : '−'} {brl(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 text-sm dark:border-zinc-800">
              <span className="text-zinc-500">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Próxima">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} transaction={editing} />
    </>
  );
}

function SortTh({ label, active, onClick, className }: { label: string; active: boolean; onClick: () => void; className?: string }) {
  return (
    <th className={cn('py-3 font-medium', className)}>
      <button onClick={onClick} className={cn('inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white', active && 'text-zinc-900 dark:text-white')}>
        {label}
        <ArrowDownUp className="h-3 w-3" />
      </button>
    </th>
  );
}
