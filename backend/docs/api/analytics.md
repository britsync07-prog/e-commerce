# Analytics API

Purpose: Provide tenant-scoped dashboard metrics for sales, orders, delivery outcomes, failed deliveries, conversations, messages, and AI reply drafts.

Auth: Bearer session with `orders:read` permission. Metrics are read from PostgreSQL source tables; no cached values are used for truth.

## `GET /shops/:shopId/metrics`

Request: Path `shopId` UUID. Optional query dates `from=YYYY-MM-DD` and `to=YYYY-MM-DD`; defaults to the last 30 calendar days. The range cannot exceed 367 days.

Response:

```json
{
  "period": { "from": "2026-09-01", "to": "2026-09-28" },
  "sales": { "grossRevenue": 500, "deliveredRevenue": 500, "orderCount": 1 },
  "orders": { "placed": 0, "confirmed": 1, "packed": 0, "shipped": 0, "delivered": 0, "cancelled": 0, "returned": 0 },
  "delivery": { "booked": 0, "pickedUp": 0, "inTransit": 0, "delivered": 0, "failed": 0, "returned": 0, "failedDeliveries": { "total": 0, "open": 0, "rescheduled": 0, "returned": 0 } },
  "ai": { "conversations": 0, "messages": 0, "aiMessages": 0, "drafts": { "total": 0, "suggested": 0, "approved": 0, "rejected": 0, "needs_review": 0 } }
}
```

Metric definitions: `placed` is the legacy `new` order state; gross revenue includes new/confirmed/packed/shipped/delivered orders; delivered revenue includes delivered orders only. Cancelled and returned orders are reported separately and excluded from gross revenue. Empty periods return zero values.

Side effects: None.

Audit/timeline: None for read-only reporting.

Cache: Client-side caching is allowed for dashboard reads. Refetch after order, delivery, payment, or inbox mutations. Server does not cache metrics.

Errors: `400 VALIDATION_ERROR`, `401 AUTH_REQUIRED`, `403 SHOP_ACCESS_DENIED`, `403 PERMISSION_DENIED`.
