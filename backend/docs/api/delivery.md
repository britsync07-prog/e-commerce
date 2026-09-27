# Delivery API

Base path: `/api/v1/delivery`

Purpose:
- Manual courier booking for P0 operations.
- Shipment list/detail for dashboard delivery queues.
- Tracking events for manual status changes.
- Keeps order timeline, audit, and stock return logic in sync.

Auth:
- All endpoints require Bearer auth.
- Read endpoints require `delivery:read`.
- Write endpoints require `delivery:write`.

## `GET /shops/:shopId/shipments`

Request:
- Path `shopId`: shop UUID.
- Query `status`: optional `booked`, `picked_up`, `in_transit`, `delivered`, `failed`, `returned`, `cancelled`.
- Query `limit`: optional number from `1` to `100`, default `50`.

Response:
- `200`

```json
{
  "shipments": [
    {
      "id": "uuid",
      "shop_id": "uuid",
      "order_id": "uuid",
      "provider": "manual",
      "status": "booked",
      "courier_name": "Pathao Manual",
      "tracking_number": "ABC123",
      "fee": "80.00",
      "booking_source": "manual",
      "order_status": "shipped"
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Client-side cache is allowed for short dashboard reads.
- Refetch after shipment or order status writes.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`

## `POST /shops/:shopId/shipments/manual`

Purpose:
- Create a manual courier shipment for a packed order.
- Moves the order from `packed` to `shipped` in the same transaction.

Request:

```json
{
  "orderId": "uuid",
  "courierName": "Pathao Manual",
  "trackingNumber": "ABC123",
  "fee": 80,
  "note": "Booked from courier sheet"
}
```

Response:
- `201`
- Same shape as shipment detail.

Side effects:
- Inserts `shipments` row with provider `manual`.
- Inserts `shipment_tracking_events` row with status `booked`.
- Updates order status to `shipped`.
- Writes `order_timeline`.
- Writes audit actions `shipment.manual_booked` and `order.status_updated`.

Audit/timeline:
- Shipment audit target: `shipment`.
- Order timeline actor type: `staff`.

Cache:
- Do not cache write response.
- Invalidate shipment lists, order detail/list, and buyer order tracking.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 ORDER_NOT_FOUND`
- `409 ORDER_NOT_PACKED`
- `409 SHIPMENT_ADDRESS_INCOMPLETE`
- `409 SHIPMENT_ALREADY_EXISTS`
- `409 ORDER_STATUS_INVALID`

## Failed delivery and rescheduling

### `PATCH /shops/:shopId/shipments/:shipmentId/status` with `status: "failed"`

Request: Include a required `note` describing the failure. Optional `contactResult` records the buyer contact outcome and optional `rescheduleDate` records a date already agreed with the buyer.

Side effects: Creates a `failed_deliveries` issue with status `open`, records the tracking event, and writes `shipment.status_updated` audit metadata. The failed issue remains visible in shipment detail until returned or rescheduled.

### `POST /shops/:shopId/shipments/:shipmentId/reschedule`

Purpose: Resolve an open failed-delivery issue and retry the shipment.

Auth: Requires `delivery:write`.

Request:

```json
{
  "rescheduleDate": "2026-10-01",
  "contactResult": "Buyer confirmed evening delivery",
  "note": "Retry approved by buyer"
}
```

Response: `200`, same shipment detail shape, including `failedDeliveries` history.

Side effects: Marks the open failed-delivery issue `rescheduled`, moves the shipment from `failed` to `in_transit`, adds a `rescheduled` tracking event and order timeline event, and writes `shipment.rescheduled` audit metadata. It does not create a second shipment or alter payment status.

Audit/timeline: Every reschedule writes shipment audit and order timeline entries. Failed and returned transitions remain in the shipment event history.

Cache: Do not cache write responses. Invalidate shipment queues, order detail/list, and buyer tracking.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 SHIPMENT_NOT_FOUND`
- `409 SHIPMENT_NOT_FAILED`
- `409 FAILED_DELIVERY_NOT_OPEN`

## `GET /shops/:shopId/shipments/:shipmentId`

Request:
- Path `shopId`: shop UUID.
- Path `shipmentId`: shipment UUID.

Response:
- `200`

```json
{
  "shipment": {
    "id": "uuid",
    "status": "in_transit",
    "courier_name": "Pathao Manual",
    "tracking_number": "ABC123",
    "order_status": "shipped"
  },
  "events": [
    {
      "status": "booked",
      "source": "manual",
      "note": "Booked from courier sheet"
    }
  ]
}
```

Side effects:
- None.

Audit/timeline:
- None for reads.

Cache:
- Client-side cache is allowed briefly.
- Refetch after shipment status changes.

Errors:
- `400 VALIDATION_ERROR`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 SHIPMENT_NOT_FOUND`

## `PATCH /shops/:shopId/shipments/:shipmentId/status`

Purpose:
- Manually add courier tracking status.
- Moves order to `delivered` or `returned` when shipment reaches those statuses.

Request:

```json
{
  "status": "delivered",
  "note": "Delivered by courier"
}
```

Response:
- `200`
- Same shape as shipment detail.

Side effects:
- Updates shipment status.
- Inserts `shipment_tracking_events`.
- Writes audit action `shipment.status_updated`.
- If status is `delivered`, updates order to `delivered`.
- If status is `returned`, updates order to `returned` and restores inventory.

Audit/timeline:
- Shipment status update writes audit.
- Delivered/returned shipment writes order timeline and order audit.

Cache:
- Do not cache write response.
- Invalidate shipment lists, order detail/list, storefront stock on return, and buyer tracking.

Errors:
- `400 VALIDATION_ERROR`
- `400 REASON_REQUIRED`
- `401 AUTH_REQUIRED`
- `403 PERMISSION_DENIED`
- `404 SHIPMENT_NOT_FOUND`
- `409 SHIPMENT_STATUS_UNCHANGED`
- `409 SHIPMENT_STATUS_INVALID`
- `409 ORDER_STATUS_INVALID`
