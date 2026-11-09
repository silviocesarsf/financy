import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './shared/errors';
import { authenticate } from './shared/middlewares/auth';
import { authRoutes } from './modules/auth/auth.routes';
import { categoriesRoutes } from './modules/categories/categories.routes';
import { transactionsRoutes } from './modules/transactions/transactions.routes';
import { recurringRoutes } from './modules/recurring/recurring.routes';
import { importsRoutes } from './modules/imports/imports.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { forecastRoutes } from './modules/forecast/forecast.routes';
import { insightsRoutes } from './modules/insights/insights.routes';
import { goalsRoutes } from './modules/goals/goals.routes';

export const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(',') }));
app.use(express.json({ limit: '2mb' }));

const api = Router();
api.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
api.use('/auth', authRoutes);

const privateApi = Router();
privateApi.use(authenticate);
privateApi.use('/categories', categoriesRoutes);
privateApi.use('/transactions', transactionsRoutes);
privateApi.use('/recurring', recurringRoutes);
privateApi.use('/imports', importsRoutes);
privateApi.use('/dashboard', dashboardRoutes);
privateApi.use('/forecast', forecastRoutes);
privateApi.use('/insights', insightsRoutes);
privateApi.use('/goals', goalsRoutes);

api.use(privateApi);
app.use('/api', api);
app.use(errorHandler);
