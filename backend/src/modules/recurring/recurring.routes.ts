import { Router } from 'express';
import { recurringSchema, recurringService } from './recurring.service';

export const recurringRoutes = Router();

recurringRoutes.get('/', async (req, res) => {
  res.json(await recurringService.list(req.userId));
});

recurringRoutes.post('/', async (req, res) => {
  await recurringService.create(req.userId, recurringSchema.parse(req.body));
  res.status(201).end();
});

recurringRoutes.put('/:id', async (req, res) => {
  await recurringService.update(req.userId, req.params.id, recurringSchema.parse(req.body));
  res.status(204).end();
});

recurringRoutes.delete('/:id', async (req, res) => {
  await recurringService.remove(req.userId, req.params.id);
  res.status(204).end();
});

recurringRoutes.post('/:id/launch', async (req, res) => {
  await recurringService.launch(req.userId, req.params.id);
  res.status(201).end();
});
