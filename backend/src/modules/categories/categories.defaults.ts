import type { TransactionType } from '@prisma/client';

interface DefaultCategory {
  name: string;
  color: string;
  icon: string;
  type: TransactionType;
  keywords: string[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Alimentação', color: '#f97316', icon: 'utensils', type: 'EXPENSE', keywords: ['ifood', 'restaurante', 'lanchonete', 'padaria', 'burger', 'pizza', 'mcdonalds', 'mc donalds', 'subway', 'rappi', 'cafe', 'cafeteria', 'acai', 'sushi', 'churrascaria', 'bk', 'outback', 'starbucks', 'ze delivery'] },
  { name: 'Mercado', color: '#22c55e', icon: 'shopping-cart', type: 'EXPENSE', keywords: ['mercado', 'supermercado', 'atacadao', 'assai', 'carrefour', 'pao de acucar', 'hortifruti', 'sacolao', 'sams club', 'atacadista', 'st marche'] },
  { name: 'Transporte', color: '#3b82f6', icon: 'car', type: 'EXPENSE', keywords: ['uber', '99app', '99 pop', '99pop', 'cabify', 'posto', 'shell', 'ipiranga', 'petrobras', 'combustivel', 'estacionamento', 'sem parar', 'veloe', 'conectcar', 'metro', 'onibus', 'bilhete unico', 'pedagio', 'estapar'] },
  { name: 'Moradia', color: '#a855f7', icon: 'home', type: 'EXPENSE', keywords: ['aluguel', 'condominio', 'enel', 'cpfl', 'cemig', 'copel', 'sabesp', 'sanepar', 'comgas', 'energia', 'iptu'] },
  { name: 'Assinaturas', color: '#ec4899', icon: 'tv', type: 'EXPENSE', keywords: ['netflix', 'spotify', 'amazon prime', 'prime video', 'disney', 'hbo', 'youtube', 'apple.com', 'deezer', 'globoplay', 'paramount', 'chatgpt', 'openai', 'google one', 'icloud', 'crunchyroll', 'claude'] },
  { name: 'Saúde', color: '#ef4444', icon: 'heart-pulse', type: 'EXPENSE', keywords: ['farmacia', 'drogasil', 'droga raia', 'drogaria', 'pague menos', 'hospital', 'clinica', 'laboratorio', 'unimed', 'dentista', 'smart fit', 'smartfit', 'academia', 'bluefit', 'odonto'] },
  { name: 'Compras', color: '#eab308', icon: 'shopping-bag', type: 'EXPENSE', keywords: ['mercado livre', 'mercadolivre', 'amazon', 'shopee', 'aliexpress', 'magalu', 'magazine', 'americanas', 'shein', 'renner', 'riachuelo', 'zara', 'centauro', 'netshoes', 'kabum', 'casas bahia'] },
  { name: 'Lazer', color: '#14b8a6', icon: 'gamepad-2', type: 'EXPENSE', keywords: ['cinema', 'cinemark', 'ingresso', 'sympla', 'steam', 'playstation', 'xbox', 'nintendo', 'show', 'teatro', 'parque'] },
  { name: 'Educação', color: '#6366f1', icon: 'graduation-cap', type: 'EXPENSE', keywords: ['curso', 'udemy', 'alura', 'escola', 'faculdade', 'universidade', 'livraria', 'coursera', 'rocketseat', 'duolingo'] },
  { name: 'Viagem', color: '#0ea5e9', icon: 'plane', type: 'EXPENSE', keywords: ['hotel', 'airbnb', 'booking', 'latam', 'gol linhas', 'azul linhas', 'decolar', '123milhas', 'hostel', 'pousada'] },
  { name: 'Contas e serviços', color: '#64748b', icon: 'smartphone', type: 'EXPENSE', keywords: ['vivo', 'claro', 'tim', 'internet', 'seguro', 'cartorio', 'tarifa', 'anuidade', 'iof'] },
  { name: 'Pets', color: '#d97706', icon: 'paw-print', type: 'EXPENSE', keywords: ['petz', 'cobasi', 'petshop', 'pet shop', 'veterinario'] },
  { name: 'Outros', color: '#94a3b8', icon: 'circle-dashed', type: 'EXPENSE', keywords: [] },
  { name: 'Salário', color: '#10b981', icon: 'briefcase', type: 'INCOME', keywords: ['salario', 'folha', 'proventos'] },
  { name: 'Freelance', color: '#06b6d4', icon: 'wallet', type: 'INCOME', keywords: ['freela', 'freelance'] },
  { name: 'Investimentos', color: '#8b5cf6', icon: 'trending-up', type: 'INCOME', keywords: ['rendimento', 'dividendo', 'juros'] },
  { name: 'Outras receitas', color: '#84cc16', icon: 'piggy-bank', type: 'INCOME', keywords: [] },
];

export const FALLBACK_CATEGORY = { EXPENSE: 'Outros', INCOME: 'Outras receitas' } as const;
