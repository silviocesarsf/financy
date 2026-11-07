# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão geral

Financy: app de finanças pessoais (multiusuário). Monorepo sem workspace raiz:
- `backend/` — API Express 5 + Prisma (MySQL 8.4) + Zod, TypeScript (CommonJS/nodenext).
- `frontend/` — React 19 + Vite 6 + Tailwind 4 + TanStack Query + Recharts.

Código, mensagens de erro e UI em português (pt-BR).

## Comandos

Não há testes nem linter configurados; a validação é por typecheck/build.

```bash
# Banco + API via Docker (requer .env na raiz com JWT_SECRET; ver .env.example)
docker compose up -d mysql          # só o MySQL (porta 3306)
docker compose up -d --build        # MySQL + API (porta 3333; aplica migrations no start)

# Backend (backend/.env precisa de DATABASE_URL e JWT_SECRET >= 16 chars)
cd backend
npm run dev          # tsx watch, http://localhost:3333/api
npm run typecheck    # tsc --noEmit
npm run build        # tsc -> dist/
npm run db:migrate   # prisma migrate dev (cria migration após alterar schema.prisma)
npm run db:generate  # regenera o Prisma Client
npm run db:studio

# Frontend
cd frontend
npm run dev          # Vite :5173, proxy /api -> http://localhost:3333
npm run build        # tsc -b && vite build
```

## Arquitetura do backend

- `src/app.ts` monta tudo sob `/api`. `/health` e `/auth` são públicos; todas as demais rotas passam por `authenticate` (JWT Bearer), que popula `req.userId`.
- Cada domínio em `src/modules/<nome>/` segue `*.routes.ts` (parse Zod de body/query + chamada ao service) → `*.service.ts` (objeto literal `xxxService` com a lógica e Prisma) → `*.schemas.ts` (schemas Zod). Alguns módulos definem o schema dentro do service.
- Rotas não usam try/catch: Express 5 propaga rejeições de async handlers para `shared/errors.ts#errorHandler`, que mapeia `ZodError`→400, `AppError`→status, Multer→400, Prisma `P2002`→409. Lance `new AppError(status, msg)` ou `notFound('X')`.
- **Isolamento por usuário**: toda query filtra por `userId`; para IDs vindos do cliente use helpers como `categoriesService.ensureOwnership` / `this.find(userId, id)` antes de atualizar.
- Valores monetários são `Decimal(12,2)` no banco; converta com `toNumber`/`round2` (`shared/utils/money.ts`) e serialize via `shared/serializers.ts` (respostas usam `number` e datas `YYYY-MM-DD`).
- Datas são date-only em UTC. Use `shared/utils/date.ts` (`MonthRef {year, month}`, `parseDateOnly`, `toDateOnly`, `monthStart`/`monthEnd` com fim exclusivo, `addMonths`). Filtros de mês usam o parâmetro `ym=YYYY-MM`.

### Conceitos de domínio que atravessam módulos

- **Competência vs. compra**: `Transaction.date` é o mês em que a despesa conta (para cartão = vencimento da fatura); `purchaseDate` é a data real da compra. Dashboard, forecast e insights agregam por `date`.
- **Idempotência por `fingerprint`** (`@@unique([userId, fingerprint])`):
  - Importação: `imp:<hash>` de data|tipo|valor|descrição normalizada|ocorrência — marca duplicados no preview e evita reimportar.
  - Recorrências: fingerprint por recorrência+mês, então "lançar" uma recorrência no mês é idempotente.
- **Importação em duas etapas** (`modules/imports`): `preview` faz parse (Nubank CSV cartão/conta, Nubank PDF via `pdf-parse`, OFX — `parsers.ts`), categoriza e marca duplicados sem gravar; `confirm` grava um `ImportBatch` (excluir o lote apaga as transações em cascata). `dueDate` opcional força todos os itens na competência da fatura.
- **Categorização automática** (`categories/categorizer.ts`): 1) histórico do usuário por `descriptionKey` (aprende com recategorizações), 2) `keywords` da categoria (CSV na coluna, regex por palavra sobre texto normalizado), 3) fallback "Outros" (`categories.defaults.ts`).
- **Parcelas**: `installmentNumber/Total`; `forecast/installments.ts` projeta parcelas futuras ainda não lançadas a partir da última conhecida de cada compra (agrupada por descrição + total + mês da 1ª parcela).

## Arquitetura do frontend

- `src/lib/api.ts`: wrapper `fetch` sobre `/api` (token JWT em `localStorage` `financy:token`; 401 dispara logout via `setUnauthorizedHandler`). Use `api.get/post/put/del` e `qs()` para query strings.
- `src/lib/types.ts` espelha os formatos dos serializers do backend — mantenha os dois em sincronia.
- Estado de servidor via TanStack Query (`src/hooks/queries.ts`). Após mutações em transações, chame `useInvalidateFinance()` (invalida transactions, dashboard, forecast, insights, recurring, imports).
- Páginas em `src/pages/` (uma por módulo do backend); componentes de UI compartilhados em `src/components/ui/`.

## Convenções do projeto
- Mudanças no schema exigem nova migration em `backend/prisma/migrations/` (`npm run db:migrate`); o container aplica com `prisma migrate deploy`.
