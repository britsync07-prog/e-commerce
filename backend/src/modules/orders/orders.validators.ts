import { z } from "zod";

export const checkoutSchema = z.object({
  subdomain: z.string().trim().min(3).max(40),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(6).max(40),
    address: z.string().trim().min(8).max(500),
    city: z.string().trim().max(100).optional(),
    area: z.string().trim().max(100).optional()
  }),
  items: z.array(
    z.object({
      variantId: z.string().uuid(),
      quantity: z.coerce.number().int().min(1).max(100)
    })
  ).min(1).max(50),
  paymentMethod: z.enum(["cod"]).default("cod")
});

export const trackSchema = z.object({
  orderId: z.string().uuid(),
  phone: z.string().trim().min(6).max(40)
});

