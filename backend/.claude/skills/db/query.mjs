// Executa SQL no MySQL do Financy usando as credenciais de db.env.
// Uso: node query.mjs "SELECT ..."  |  node query.mjs --write "UPDATE ..."
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const dir = dirname(fileURLToPath(import.meta.url));
const cfg = Object.fromEntries(
  readFileSync(join(dir, 'db.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

if (!cfg.DB_USER) {
  console.error('DB_USER não configurado em backend/.claude/skills/db/db.env');
  process.exit(2);
}

const args = process.argv.slice(2);
const write = args[0] === '--write';
const sql = (write ? args.slice(1) : args).join(' ').trim();
if (!sql) {
  console.error('Informe a consulta SQL.');
  process.exit(2);
}

const READ_ONLY = /^\s*(select|show|describe|desc|explain|with)\b/i;
if (!write && !READ_ONLY.test(sql)) {
  console.error('Somente leitura por padrão. Use --write (com confirmação do usuário) para alterar dados.');
  process.exit(2);
}

const enc = encodeURIComponent;
const url = `mysql://${enc(cfg.DB_USER)}:${enc(cfg.DB_PASSWORD ?? '')}@${cfg.DB_HOST || 'localhost'}:${cfg.DB_PORT || 3306}/${cfg.DB_NAME || 'financy'}`;
const prisma = new PrismaClient({ datasourceUrl: url });

const replacer = (_k, v) =>
  typeof v === 'bigint' ? Number(v) : v?.constructor?.name === 'Decimal' ? v.toString() : v;

try {
  const result = write ? await prisma.$executeRawUnsafe(sql) : await prisma.$queryRawUnsafe(sql);
  if (write) console.log(`Linhas afetadas: ${result}`);
  else {
    const rows = Array.isArray(result) ? result : [result];
    console.log(JSON.stringify(rows.slice(0, 500), replacer, 2));
    if (rows.length > 500) console.log(`... ${rows.length - 500} linhas omitidas (use LIMIT)`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
