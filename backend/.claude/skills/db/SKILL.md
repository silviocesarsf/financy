---
name: db
description: Consultar o banco MySQL do Financy (tabelas users, categories, transactions, recurrings, import_batches, goals). Use quando precisar inspecionar dados reais, validar uma correção, investigar um bug de dados ou conferir o resultado de uma importação/migration.
---

# Acesso ao banco do Financy

Execute SQL com o script desta skill (credenciais em `db.env`, nunca as exiba):

```bash
node backend/.claude/skills/db/query.mjs "SELECT id, description, amount, date FROM transactions ORDER BY date DESC LIMIT 20"
```

- Saída em JSON (máx. 500 linhas — sempre use `LIMIT`).
- Se o script disser que `DB_USER` não está configurado, peça ao usuário para preencher `backend/.claude/skills/db/db.env`.
- Requer `npm install` no backend (usa `@prisma/client`) e o MySQL acessível (`docker compose up -d mysql`).

## Regras

- Padrão é **somente leitura** (SELECT/SHOW/DESCRIBE/EXPLAIN/WITH).
- Para INSERT/UPDATE/DELETE/DDL: mostre o SQL ao usuário, peça confirmação explícita e só então rode com `--write`:
  `node backend/.claude/skills/db/query.mjs --write "UPDATE ..."`. Nunca altere schema por aqui — use migrations do Prisma.
- Sempre filtre por `userId` ao analisar dados de um usuário; não despeje `passwordHash` nem dados pessoais desnecessários.

## Referência rápida do schema

Fonte da verdade: `backend/prisma/schema.prisma`. Nomes de tabela são snake_case (`@@map`), colunas em camelCase.

- `transactions`: `type` (EXPENSE/INCOME), `amount` decimal, `date` = mês de competência (fatura), `purchaseDate` = data da compra, `fingerprint` (idempotência de importação/recorrência), `installmentNumber/Total`, `importBatchId`.
- `categories`: `keywords` é CSV; único por (`userId`, `name`, `type`).
- `recurrings`, `import_batches`, `goals`, `users`.
