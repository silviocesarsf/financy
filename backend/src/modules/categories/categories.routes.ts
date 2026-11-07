import { Router } from 'express';
import { z } from 'zod';
import { categoriesService } from './categories.service';
import { categorySchema } from './categories.schemas';

export const categoriesRoutes = Router();

categoriesRoutes.get('/', async (req, res) => {
  const type = z.enum(['EXPENSE', 'INCOME']).optional().parse(req.query.type);
  res.json(await categoriesService.list(req.userId, type));
});

categoriesRoutes.post('/', async (req, res) => {
  res.status(201).json(await categoriesService.create(req.userId, categorySchema.parse(req.body)));
});

categoriesRoutes.put('/:id', async (req, res) => {
  res.json(await categoriesService.update(req.userId, req.params.id, categorySchema.parse(req.body)));
});

categoriesRoutes.delete('/:id', async (req, res) => {
  await categoriesService.remove(req.userId, req.params.id);
  res.status(204).end();
});
