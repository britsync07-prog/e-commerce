import { z } from "zod";
import { aiModes, languages } from "./onboarding.types.js";

const optionalText = z.string().trim().min(1).max(200).optional();

export const checkSubdomainSchema = z.object({
  subdomain: z.string().trim().min(3).max(40)
});

export const startOnboardingSchema = z.object({
  ownerName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(6).max(30).optional(),
  language: z.enum(languages).default("bn-en"),
  shopName: z.string().trim().min(2).max(120),
  subdomain: z.string().trim().min(3).max(40).optional(),
  category: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
  currency: z.string().trim().min(3).max(8)
});

export const updateShopSchema = z.object({
  legalName: optionalText,
  displayName: optionalText,
  subdomain: z.string().trim().min(3).max(40).optional(),
  category: optionalText,
  country: optionalText,
  currency: z.string().trim().min(3).max(8).optional(),
  address: optionalText,
  logoUrl: z.string().trim().url().optional(),
  language: z.enum(languages).optional(),
  policyDefaults: z
    .object({
      deliveryCharge: z.number().min(0).max(100000).optional(),
      returnDays: z.number().int().min(0).max(365).optional(),
      codAllowed: z.boolean().optional(),
      advancePaymentRules: optionalText
    })
    .optional()
});

export const addProductSchema = z.object({
  name: z.string().trim().min(2).max(160),
  price: z.number().positive().max(100000000),
  stock: z.number().int().min(0).max(1000000),
  imageUrl: z.string().trim().url().optional(),
  variants: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  deliveryNotes: optionalText
});

export const updateAiModeSchema = z.object({
  aiMode: z.enum(aiModes)
});

export const chooseTemplateSchema = z.object({
  templateId: z.string().trim().min(3).max(120)
});

export const shopParamsSchema = z.object({
  shopId: z.string().uuid()
});
