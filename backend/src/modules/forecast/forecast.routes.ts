import { Router } from 'express';
import { z } from 'zod';
import { forecastService } from './forecast.service';

export const forecastRoutes = Router();

forecastRoutes.get('/', async (req, res) => {
  const months = z.coerce.number().int().min(1).max(24).default(6).parse(req.query.months);
  res.json(await forecastService.forecast(req.userId, months));
});
