import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Pagamento de fatura fora dos totais
/**
 * Pagamento de fatura é transferência conta → cartão: os itens da fatura já contam como despesa,
 * então ele não entra em receitas/despesas. Collation utf8mb4_unicode_ci ignora caixa e acentos.
 */
const BILL_PAYMENT_TERMS = ['pagamento fatura', 'pagamento de fatura'];

export const notBillPayment: Prisma.TransactionWhereInput = {
  NOT: BILL_PAYMENT_TERMS.map((t) => ({ description: { contains: t } })),
};

export const notBillPaymentSql = Prisma.join(
  BILL_PAYMENT_TERMS.map((t) => Prisma.sql`description NOT LIKE ${`%${t}%`}`),
  ' AND ',
);
