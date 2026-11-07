import { app } from './app';
import { env } from './config/env';
import { prisma } from './shared/prisma';

const server = app.listen(env.PORT, () => {
  console.log(`Financy API rodando em http://localhost:${env.PORT}/api`);
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
