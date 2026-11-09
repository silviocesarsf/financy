import { Router } from 'express';
import { z } from 'zod';
import { parseRef } from '../../shared/utils/date';
import { transactionsService } from './transactions.service';
import {
  bulkCategorySchema,
  bulkDeleteSchema,
  invoicePaymentSchema,
  listQuerySchema,
  transactionSchema,
  typeEnum,
} from './transactions.schemas';

export const transactionsRoutes = Router();

transactionsRoutes.get('/', async (req, res) => {
  res.json(await transactionsService.list(req.userId, listQuerySchema.parse(req.query)));
});

transactionsRoutes.get('/suggest-category', async (req, res) => {
  const { description, type } = z
    .object({ description: z.string().min(2).max(255), type: typeEnum })
    .parse(req.query);
  res.json(await transactionsService.suggestCategory(req.userId, description, type));
});

transactionsRoutes.get('/invoice', async (req, res) => {
  res.json(await transactionsService.invoice(req.userId, parseRef(String(req.query.month ?? ''))));
});

transactionsRoutes.post('/invoice/pay', async (req, res) => {
  res.status(201).json(await transactionsService.payInvoice(req.userId, invoicePaymentSchema.parse(req.body)));
});

transactionsRoutes.get('/:id', async (req, res) => {
  res.json(await transactionsService.get(req.userId, req.params.id));
});

transactionsRoutes.post('/', async (req, res) => {
  res.status(201).json(await transactionsService.create(req.userId, transactionSchema.parse(req.body)));
});

transactionsRoutes.post('/bulk-delete', async (req, res) => {
  res.json(await transactionsService.bulkDelete(req.userId, bulkDeleteSchema.parse(req.body).ids));
});

transactionsRoutes.post('/bulk-category', async (req, res) => {
  res.json(await transactionsService.bulkCategory(req.userId, bulkCategorySchema.parse(req.body)));
});

transactionsRoutes.put('/:id', async (req, res) => {
  const input = transactionSchema.omit({ installments: true }).parse(req.body);
  res.json(await transactionsService.update(req.userId, req.params.id, input));
});

transactionsRoutes.delete('/:id', async (req, res) => {
  await transactionsService.remove(req.userId, req.params.id);
  res.status(204).end();
});
