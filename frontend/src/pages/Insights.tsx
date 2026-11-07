import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, Sparkles, ThumbsUp, XOctagon } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/format';
import type { Insight } from '../lib/types';
import { Empty, PageHeader, Spinner } from '../components/ui/misc';

const STYLES = {
  danger: { icon: XOctagon, cls: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  warning: { icon: AlertTriangle, cls: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  info: { icon: Info, cls: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400' },
  positive: { icon: ThumbsUp, cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
};

export function InsightCard({ insight, compact }: { insight: Insight; compact?: boolean }) {
  const { icon: Icon, cls } = STYLES[insight.level];
  return (
    <div className={cn('flex gap-3', compact ? 'rounded-xl p-2' : 'card p-5')}>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', cls)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className={cn('font-medium', compact ? 'text-sm' : '')}>{insight.title}</p>
        <p className={cn('mt-0.5 text-zinc-500', compact ? 'line-clamp-2 text-xs' : 'text-sm')}>{insight.description}</p>
      </div>
    </div>
  );
}

export function InsightsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['insights'], queryFn: () => api.get<Insight[]>('/insights') });
  return (
    <>
      <PageHeader title="Insights" subtitle="Análises automáticas sobre seus hábitos de consumo, compromissos e tendências." />
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={Sparkles} title="Tudo em ordem por aqui" description="Nenhum alerta no momento. Continue registrando suas transações." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      )}
    </>
  );
}
