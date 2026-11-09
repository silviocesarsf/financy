import type { ReactNode } from 'react';
import { CategoryIcon } from './CategoryIcon';
import { brl, cn, dateShort, PAYMENT_LABELS } from '../lib/format';
import type { Transaction } from '../lib/types';

export function TransactionRow({ tx, onClick, badges }: { tx: Transaction; onClick?: () => void; badges?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
    >
      <CategoryIcon icon={tx.category?.icon} color={tx.category?.color} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tx.description}</p>
        <p className="truncate text-xs text-zinc-500">
          {tx.category?.name ?? 'Sem categoria'} · {dateShort(tx.purchaseDate ?? tx.date)} · {PAYMENT_LABELS[tx.paymentMethod]}
          {tx.installmentTotal && ` · ${tx.installmentNumber}/${tx.installmentTotal}`}
        </p>
        {badges && <div className="mt-1 flex flex-wrap gap-1">{badges}</div>}
      </div>
      <span className={cn('tabular text-sm font-semibold', tx.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : '')}>
        {tx.type === 'INCOME' ? '+' : '−'} {brl(tx.amount)}
      </span>
    </button>
  );
}
