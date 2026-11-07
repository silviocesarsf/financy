import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Category, TxType } from '../lib/types';

export const useCategories = (type?: TxType) => {
  const query = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
    staleTime: 5 * 60_000,
  });
  return { ...query, data: type ? query.data?.filter((c) => c.type === type) : query.data };
};

/** Invalida tudo que depende de transações (dashboard, previsões, insights...). */
export const useInvalidateFinance = () => {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ['transactions', 'dashboard', 'forecast', 'insights', 'recurring', 'imports'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );
};

export function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
