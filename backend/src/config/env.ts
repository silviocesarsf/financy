import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter ao menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(3333),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Cadastro de novos usuários desabilitado por padrão
  ALLOW_REGISTRATION: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

export const env = schema.parse(process.env);
