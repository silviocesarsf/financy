import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLong, shiftMonth } from '../lib/format';

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button onClick={() => onChange(shiftMonth(value, -1))} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white" aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-32 text-center text-sm font-medium">{monthLong(value)}</span>
      <button onClick={() => onChange(shiftMonth(value, 1))} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white" aria-label="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
