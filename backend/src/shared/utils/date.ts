export interface MonthRef {
  year: number;
  month: number; // 1-12
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export const ymKey = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
export const refKey = (r: MonthRef) => `${r.year}-${pad2(r.month)}`;

export const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

export function parseDateOnly(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Data inválida: ${s}`);
  return d;
}

export function currentRef(): MonthRef {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function parseRef(ym?: string): MonthRef {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return currentRef();
  const [year, month] = ym.split('-').map(Number);
  return { year, month };
}

export function addMonths(r: MonthRef, delta: number): MonthRef {
  const idx = r.year * 12 + (r.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export const monthStart = (r: MonthRef) => new Date(Date.UTC(r.year, r.month - 1, 1));
export const monthEnd = (r: MonthRef) => new Date(Date.UTC(r.year, r.month, 1)); // exclusivo
export const daysInMonth = (r: MonthRef) => new Date(Date.UTC(r.year, r.month, 0)).getUTCDate();

/** Diferença em meses entre duas referências (b - a). */
export const monthDiff = (a: MonthRef, b: MonthRef) => (b.year - a.year) * 12 + (b.month - a.month);

export const refOf = (d: Date): MonthRef => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
