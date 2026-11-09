import { Router } from 'express';
import { launchAllSchema, recurringSchema, recurringService } from './recurring.service';

export const recurringRoutes = Router();

recurringRoutes.get('/', async (req, res) => {
  res.json(await recurringService.list(req.userId));
});

recurringRoutes.post('/', async (req, res) => {
  const input = recurringSchema.parse(req.body);
  const { launchAll } = launchAllSchema.parse(req.body);
  const r = await recurringService.create(req.userId, input);
  const launched = launchAll ? await recurringService.launchAll(req.userId, r.id) : 0;
  res.status(201).json({ launched });
});

recurringRoutes.put('/:id', async (req, res) => {
  const input = recurringSchema.parse(req.body);
  const { launchAll } = launchAllSchema.parse(req.body);
  await recurringService.update(req.userId, req.params.id, input);
  const launched = launchAll ? await recurringService.launchAll(req.userId, req.params.id) : 0;
  res.json({ launched });
});

recurringRoutes.delete('/:id', async (req, res) => {
  await recurringService.remove(req.userId, req.params.id);
  res.status(204).end();
});

recurringRoutes.post('/:id/launch', async (req, res) => {
  await recurringService.launch(req.userId, req.params.id);
  res.status(201).end();
});
