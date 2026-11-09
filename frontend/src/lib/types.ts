export type TxType = 'EXPENSE' | 'INCOME';
export type PaymentMethod = 'CREDIT_CARD' | 'DEBIT_CARD' | 'PIX' | 'CASH' | 'BOLETO' | 'TRANSFER' | 'OTHER';
export type Source = 'MANUAL' | 'NUBANK_CARD_CSV' | 'NUBANK_ACCOUNT_CSV' | 'NUBANK_PDF' | 'OFX' | 'RECURRING';

export interface User {
  id: string;
  name: string;
  email: string;
  monthlyIncome: number;
  payday: number;
}

export interface CategoryRef {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface Category extends CategoryRef {
  type: TxType;
  keywords: string[];
  monthlyBudget: number | null;
}

export interface Transaction {
  id: string;
  type: TxType;
  description: string;
  amount: number;
  date: string;
  /** data original da compra (itens de fatura); `date` = mês em que conta */
  purchaseDate: string | null;
  paymentMethod: PaymentMethod;
  source: Source;
  installmentNumber: number | null;
  installmentTotal: number | null;
  notes: string | null;
  categoryId: string | null;
  category: CategoryRef | null;
  importBatchId: string | null;
}

export interface TransactionList {
  items: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  totals: { income: number; expense: number };
}

export interface Recurring {
  id: string;
  type: TxType;
  description: string;
  amount: number;
  dayOfMonth: number;
  categoryId: string | null;
  category: CategoryRef | null;
  paymentMethod: PaymentMethod;
  active: boolean;
  startDate: string;
  endDate: string | null;
  activeThisMonth: boolean;
  launchedThisMonth: boolean;
}

export interface Dashboard {
  month: string;
  summary: {
    income: number;
    expense: number;
    balance: number;
    previousIncome: number;
    incomeChangePct: number | null;
    previousExpense: number;
    expenseChangePct: number | null;
    /** mês futuro: valores projetados */
    projected: boolean;
  };
  committed: {
    incomeBase: number;
    expectedIncome: number;
    fixed: number;
    installments: number;
    installmentsProjected: number;
    /** compras à vista no cartão (obrigação da fatura) */
    card: number;
    total: number;
    pct: number;
    free: number;
    previousPct: number | null;
    spentPct: number;
    available: number;
    usedPct: number;
    status: { paid: number; pending: number; toLaunch: number; cardBillPaid: boolean } | null;
  };
  pace: {
    budget: number | null;
    projectedTotal: number | null;
    dayOfMonth: number | null;
  };
  byCategory: {
    categoryId: string | null;
    name: string;
    color: string;
    icon: string;
    total: number;
    share: number;
    budget: number | null;
    budgetPct: number | null;
  }[];
  budgets: { categoryId: string; name: string; color: string; icon: string; spent: number; budget: number; pct: number }[];
  daily: { day: number; total: number; cumulative: number | null; planned: number | null; budget: number | null }[];
  trend: { month: string; income: number; expense: number; balance: number; projected: boolean }[];
  recent: Transaction[];
}

export interface Forecast {
  currentMonth: {
    month: string;
    spent: number;
    projected: number;
    income: number;
    projectedBalance: number;
    dayOfMonth: number;
    daysInMonth: number;
  };
  averages: { variable: number; monthsConsidered: number };
  months: {
    month: string;
    income: number;
    fixed: number;
    installments: number;
    variable: number;
    scheduled: number;
    expense: number;
    balance: number;
    cumulative: number;
    committedPct: number;
  }[];
  installments: { description: string; amount: number; remaining: number; endMonth: string }[];
}

export interface Insight {
  id: string;
  level: 'positive' | 'info' | 'warning' | 'danger';
  title: string;
  description: string;
}

export interface Goal {
  id: string;
  name: string;
  color: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string | null;
  progress: number;
  monthlyNeeded: number | null;
}

export interface ImportItem {
  date: string;
  description: string;
  amount: number;
  type: TxType;
  paymentMethod: PaymentMethod;
  installmentNumber: number | null;
  installmentTotal: number | null;
  selected: boolean;
  fingerprint: string;
  categoryId: string | null;
  duplicate: boolean;
}

export interface Invoice {
  month: string;
  items: number;
  expense: number;
  credits: number;
  total: number;
  projectedInstallments: number;
  payment: { id: string; date: string; amount: number; paymentMethod: PaymentMethod } | null;
}

export interface ImportPreview {
  fileName: string;
  source: Exclude<Source, 'MANUAL' | 'RECURRING'>;
  label: string;
  isCardInvoice: boolean;
  dueDate: string | null;
  /** mês de competência sugerido (AAAA-MM) */
  refMonth: string | null;
  items: ImportItem[];
}

export interface ImportBatch {
  id: string;
  fileName: string;
  source: Source;
  totalItems: number;
  createdAt: string;
}
