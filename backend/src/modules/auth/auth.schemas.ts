import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(180),
  password: z.string().min(6).max(100),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  monthlyIncome: z.number().min(0).max(100_000_000),
  payday: z.number().int().min(1).max(31),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(100),
});
