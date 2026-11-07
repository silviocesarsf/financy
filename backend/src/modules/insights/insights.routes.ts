import { Router } from 'express';
import { insightsService } from './insights.service';

export const insightsRoutes = Router();

insightsRoutes.get('/', async (req, res) => {
  res.json(await insightsService.list(req.userId));
});
