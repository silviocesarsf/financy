import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { User } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../shared/prisma';
import { AppError, notFound } from '../../shared/errors';
import { env } from '../../config/env';
import { toNumber } from '../../shared/utils/money';
import { categoriesService } from '../categories/categories.service';
import type { loginSchema, passwordSchema, profileSchema, registerSchema } from './auth.schemas';

const serializeUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  monthlyIncome: toNumber(u.monthlyIncome),
  payday: u.payday,
});

const sign = (userId: string) =>
  jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] });

export const authService = {
  async register(input: z.infer<typeof registerSchema>) {
    const exists = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (exists) throw new AppError(409, 'E-mail já cadastrado');
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, 10) },
    });
    await categoriesService.seedDefaults(user.id);
    return { token: sign(user.id), user: serializeUser(user) };
  },

  async login(input: z.infer<typeof loginSchema>) {
    console.log('login input', input);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new AppError(401, 'E-mail ou senha inválidos');
    }
    return { token: sign(user.id), user: serializeUser(user) };
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound('Usuário');
    return serializeUser(user);
  },

  async updateProfile(userId: string, input: z.infer<typeof profileSchema>) {
    return serializeUser(await prisma.user.update({ where: { id: userId }, data: input }));
  },

  async changePassword(userId: string, input: z.infer<typeof passwordSchema>) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new AppError(400, 'Senha atual incorreta');
    }
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(input.newPassword, 10) },
    });
  },
};
