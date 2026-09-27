import { z } from "zod";

export const shopParamsSchema = z.object({
  shopId: z.string().uuid()
});

export const shipmentParamsSchema = z.object({
  shopId: z.string().uuid(),
  shipmentId: z.string().uuid()
});

export const listShipmentsQuerySchema = z.object({
  status: z.enum(["booked", "picked_up", "in_transit", "delivered", "failed", "returned", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const manualShipmentSchema = z.object({
  orderId: z.string().uuid(),
  courierName: z.string().trim().min(2).max(120),
  trackingNumber: z.string().trim().max(120).optional(),
  fee: z.coerce.number().min(0).max(999999).default(0),
  note: z.string().trim().max(500).optional()
});

export const shipmentStatusSchema = z.object({
  status: z.enum(["picked_up", "in_transit", "delivered", "failed", "returned", "cancelled"]),
  note: z.string().trim().min(3).max(500).optional(),
  contactResult: z.string().trim().max(240).optional(),
  rescheduleDate: z.string().date().optional()
});

export const rescheduleSchema = z.object({
  rescheduleDate: z.string().date(),
  contactResult: z.string().trim().min(2).max(240),
  note: z.string().trim().min(3).max(500).optional()
});
