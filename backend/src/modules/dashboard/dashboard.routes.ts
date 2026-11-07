import { Router } from 'express';
import { parseRef } from '../../shared/utils/date';
import { dashboardService } from './dashboard.service';

export const dashboardRoutes = Router();

dashboardRoutes.get('/', async (req, res) => {
  res.json(await dashboardService.overview(req.userId, parseRef(String(req.query.month ?? ''))));
});
