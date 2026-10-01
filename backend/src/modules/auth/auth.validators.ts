import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12)
  .max(200)
  .regex(/[a-z]/, "password must include lowercase")
  .regex(/[A-Z]/, "password must include uppercase")
  .regex(/[0-9]/, "password must include number")
  .regex(/[^A-Za-z0-9]/, "password must include symbol");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180).optional(),
  phone: z.string().trim().min(6).max(40).optional(),
  password: passwordSchema,
  language: z.string().trim().min(2).max(20).default("en")
}).refine((value) => value.email || value.phone, "email or phone is required");

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(180),
  password: z.string().min(1).max(200)
});

export const verificationRequestSchema = z.object({
  channel: z.enum(["email", "phone"])
});

export const verificationConfirmSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/)
});

export const passwordResetRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(180)
});

export const passwordResetConfirmSchema = z.object({
  identifier: z.string().trim().min(3).max(180),
  code: z.string().trim().regex(/^\d{6}$/),
  newPassword: passwordSchema
});
