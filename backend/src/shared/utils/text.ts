export const normalizeText = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const INSTALLMENT_RX = /(?:\s*-\s*)?(?:parcela\s*)?(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i;

export function extractInstallment(description: string) {
  const m = description.match(INSTALLMENT_RX);
  if (!m) return null;
  const number = Number(m[1]);
  const total = Number(m[2]);
  if (total < 2 || number < 1 || number > total) return null;
  return { number, total, base: description.replace(INSTALLMENT_RX, '').trim() };
}

/** Chave estável de descrição (sem parcela, números e símbolos) usada para aprendizado e agrupamentos. */
export function descriptionKey(description: string) {
  const base = extractInstallment(description)?.base ?? description;
  return normalizeText(base)
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
