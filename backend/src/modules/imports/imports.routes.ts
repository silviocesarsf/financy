import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../../shared/errors';
import { confirmSchema, importsService } from './imports.service';

export const importsRoutes = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, /\.(csv|ofx|pdf)$/i.test(file.originalname)),
});

importsRoutes.post('/preview', upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError(400, 'Envie um arquivo .csv, .ofx ou .pdf');
  res.json(await importsService.preview(req.userId, req.file.originalname, req.file.buffer));
});

importsRoutes.post('/confirm', async (req, res) => {
  res.status(201).json(await importsService.confirm(req.userId, confirmSchema.parse(req.body)));
});

importsRoutes.get('/', async (req, res) => {
  res.json(await importsService.list(req.userId));
});

importsRoutes.delete('/:id', async (req, res) => {
  await importsService.remove(req.userId, req.params.id);
  res.status(204).end();
});
