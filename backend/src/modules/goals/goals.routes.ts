import { Router } from 'express';
import { z } from 'zod';
import type { Goal } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { notFound } from '../../shared/errors';
import { round2, toNumber } from '../../shared/utils/money';
import { currentRef, monthDiff, parseDateOnly, refOf, toDateOnly } from '../../shared/utils/date';

const goalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetAmount: z.number().positive(),
  currentAmount: z.number().min(0).default(0),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10b981'),
});

const serialize = (g: Goal) => {
  const target = toNumber(g.targetAmount);
  const current = toNumber(g.currentAmount);
  const monthsLeft = g.deadline ? Math.max(monthDiff(currentRef(), refOf(g.deadline)), 1) : null;
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    targetAmount: target,
    currentAmount: current,
    deadline: g.deadline ? toDateOnly(g.deadline) : null,
    progress: target > 0 ? round2(Math.min((current / target) * 100, 100)) : 0,
    monthlyNeeded: monthsLeft ? round2(Math.max(target - current, 0) / monthsLeft) : null,
  };
};

async function find(userId: string, id: string) {
  const g = await prisma.goal.findFirst({ where: { id, userId } });
  if (!g) throw notFound('Meta');
  return g;
}

const toData = (i: z.infer<typeof goalSchema>) => ({ ...i, deadline: i.deadline ? parseDateOnly(i.deadline) : null });

export const goalsRoutes = Router();

goalsRoutes.get('/', async (req, res) => {
  const goals = await prisma.goal.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'asc' } });
  res.json(goals.map(serialize));
});

goalsRoutes.post('/', async (req, res) => {
  const goal = await prisma.goal.create({ data: { ...toData(goalSchema.parse(req.body)), userId: req.userId } });
  res.status(201).json(serialize(goal));
});

goalsRoutes.put('/:id', async (req, res) => {
  await find(req.userId, req.params.id);
  const goal = await prisma.goal.update({ where: { id: req.params.id }, data: toData(goalSchema.parse(req.body)) });
  res.json(serialize(goal));
});

goalsRoutes.post('/:id/contribute', async (req, res) => {
  const { amount } = z.object({ amount: z.number().refine((v) => v !== 0) }).parse(req.body);
  const g = await find(req.userId, req.params.id);
  const goal = await prisma.goal.update({
    where: { id: g.id },
    data: { currentAmount: Math.max(round2(toNumber(g.currentAmount) + amount), 0) },
  });
  res.json(serialize(goal));
});

goalsRoutes.delete('/:id', async (req, res) => {
  await find(req.userId, req.params.id);
  await prisma.goal.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
