import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180).optional(),
  phone: z.string().trim().min(6).max(40).optional(),
  password: z.string().min(8).max(200),
  language: z.string().trim().min(2).max(20).default("en")
}).refine((value) => value.email || value.phone, "email or phone is required");

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(180),
  password: z.string().min(1).max(200)
});

