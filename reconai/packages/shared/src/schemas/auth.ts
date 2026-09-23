import { z } from 'zod';
import { id } from './common.js';
import { Role } from '../types/enums.js';

export const signupSchema = z
  .object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(255),
    password: z.string().min(10).max(128),
    firmName: z.string().min(2).max(160),
    firmGstin: z.string().optional(),
    inviteToken: z.string().optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(1).max(128),
  })
  .strict();

export const inviteSchema = z
  .object({
    email: z.string().email().max(255),
    role: z.enum([Role.Partner, Role.Senior, Role.Article, Role.Viewer]),
    message: z.string().max(500).optional(),
  })
  .strict();

export const firmUpdateSchema = z
  .object({
    name: z.string().min(2).max(160).optional(),
    gstin: z.string().optional(),
    pan: z.string().optional(),
    tan: z.string().optional(),
    address: z.string().max(500).optional(),
    settings: z.record(z.unknown()).optional(),
  })
  .strict();

export const authMe = z.object({
  id,
  email: z.string().email(),
  role: z.nativeEnum(Role),
  firmId: id,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
export type FirmUpdateInput = z.infer<typeof firmUpdateSchema>;