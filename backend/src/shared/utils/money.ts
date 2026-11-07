import type { Prisma } from '@prisma/client';

export const toNumber = (v: Prisma.Decimal | number | bigint | null | undefined): number =>
  v == null ? 0 : Number(v);

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Converte "1.234,56", "R$ -12,30", "12.30" em number. */
export function parseAmount(raw: string): number {
  let s = raw.replace(/R\$/gi, '').replace(/\s/g, '').replace(/−/g, '-');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Valor inválido: ${raw}`);
  return n;
}
