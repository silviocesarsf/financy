import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../shared/middlewares/auth';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors';
import { authService } from './auth.service';
import { loginSchema, passwordSchema, profileSchema, registerSchema } from './auth.schemas';

export const authRoutes = Router();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

authRoutes.post('/register', limiter, async (req, res) => {
  // Bloqueia cadastro quando ALLOW_REGISTRATION não está habilitado
  if (!env.ALLOW_REGISTRATION) throw new AppError(403, 'Cadastro de novos usuários desabilitado');
  res.status(201).json(await authService.register(registerSchema.parse(req.body)));
});

authRoutes.post('/login', limiter, async (req, res) => {
  res.json(await authService.login(loginSchema.parse(req.body)));
});

authRoutes.get('/me', authenticate, async (req, res) => {
  res.json(await authService.me(req.userId));
});

authRoutes.put('/profile', authenticate, async (req, res) => {
  res.json(await authService.updateProfile(req.userId, profileSchema.parse(req.body)));
});

authRoutes.put('/password', authenticate, async (req, res) => {
  await authService.changePassword(req.userId, passwordSchema.parse(req.body));
  res.status(204).end();
});
