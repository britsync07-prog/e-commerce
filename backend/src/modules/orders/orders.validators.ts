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
  couponCode: z.string().trim().min(2).max(40).optional(),
  paymentMethod: z.enum(["cod"]).default("cod")
});

export const trackSchema = z.object({
  orderId: z.string().uuid(),
  phone: z.string().trim().min(6).max(40)
});

export const orderParamsSchema = z.object({
  shopId: z.string().uuid(),
  orderId: z.string().uuid()
});

export const orderListParamsSchema = z.object({
  shopId: z.string().uuid()
});

export const orderListQuerySchema = z.object({
  status: z.enum(["new", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const updateStatusSchema = z.object({
  status: z.enum(["confirmed", "packed", "shipped", "delivered", "cancelled", "returned"]),
  reason: z.string().trim().min(3).max(500).optional()
});

const draftCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(40).optional(),
  address: z.string().trim().min(8).max(500).optional(),
  city: z.string().trim().max(100).optional(),
  area: z.string().trim().max(100).optional()
});

const draftItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(100),
  confidence: z.coerce.number().min(0).max(1).default(0.5)
});

export const orderDraftParamsSchema = z.object({
  shopId: z.string().uuid(),
  draftId: z.string().uuid()
});

export const orderDraftListQuerySchema = z.object({
  status: z.enum(["draft", "ready", "confirmed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const createOrderDraftSchema = z.object({
  conversationId: z.string().uuid().optional(),
  customer: draftCustomerSchema.default({}),
  items: z.array(draftItemSchema).max(50).default([]),
  paymentMethod: z.enum(["cod"]).default("cod"),
  confidence: z.coerce.number().min(0).max(1).default(0.5)
});

export const updateOrderDraftSchema = z.object({
  customer: draftCustomerSchema.optional(),
  items: z.array(draftItemSchema).max(50).optional(),
  status: z.enum(["draft", "ready", "cancelled"]).optional(),
  confidence: z.coerce.number().min(0).max(1).optional()
});
