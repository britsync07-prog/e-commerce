import { db } from "../../shared/db.js";
import type { PoolClient } from "pg";
import { lockInventoryVariants } from "../../shared/inventory-lock.js";

type ShipmentStatus = "booked" | "picked_up" | "in_transit" | "delivered" | "failed" | "returned" | "cancelled";

const transitions: Record<ShipmentStatus, ShipmentStatus[]> = {
  booked: ["picked_up", "in_transit", "failed", "cancelled"],
  picked_up: ["in_transit", "failed"],
  in_transit: ["delivered", "failed", "returned"],
  delivered: [],
  failed: ["in_transit", "returned", "cancelled"],
  returned: [],
  cancelled: []
};

export class DeliveryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

async function moveOrderForShipment(
  client: PoolClient,
  shopId: string,
  orderId: string,
  status: "shipped" | "delivered" | "returned",
  reason: string | undefined,
  actorId: string
) {
  const order = await client.query("select id, status from orders where shop_id = $1 and id = $2 for update", [shopId, orderId]);
  if (!order.rowCount) throw new DeliveryError("Order not found.", 404, "ORDER_NOT_FOUND");

  const current = order.rows[0].status as string;
  if (current === status) return;
  const allowed =
    (current === "packed" && status === "shipped") ||
    (current === "shipped" && (status === "delivered" || status === "returned")) ||
    (current === "delivered" && status === "returned");
  if (!allowed) throw new DeliveryError("Order status move is not allowed.", 409, "ORDER_STATUS_INVALID");
  if (status === "returned" && !reason) throw new DeliveryError("Reason is required for return.", 400, "REASON_REQUIRED");

  await client.query("update orders set status = $3, updated_at = now() where shop_id = $1 and id = $2", [shopId, orderId, status]);

  if (status === "returned") {
    const items = await client.query("select variant_id, quantity from order_items where shop_id = $1 and order_id = $2", [shopId, orderId]);
    await lockInventoryVariants(client, shopId, items.rows.map((item) => item.variant_id));
    for (const item of items.rows) {
      const currentStock = await client.query("select coalesce(sum(delta_quantity), 0)::int as quantity from inventory_ledger where shop_id = $1 and variant_id = $2", [
        shopId,
        item.variant_id
      ]);
      const quantityAfter = Number(currentStock.rows[0].quantity) + Number(item.quantity);
      await client.query(
        `
          insert into inventory_ledger (shop_id, variant_id, reason, delta_quantity, quantity_after, reference_type, reference_id, created_by)
          values ($1, $2, 'order_returned', $3, $4, 'order', $5, $6)
        `,
        [shopId, item.variant_id, Number(item.quantity), quantityAfter, orderId, actorId]
      );
    }
  }

  await client.query(
    "insert into order_timeline (shop_id, order_id, status, actor_type, actor_id, note) values ($1, $2, $3, 'staff', $4, $5)",
    [shopId, orderId, status, actorId, reason ?? null]
  );
  await client.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'order.status_updated', 'order', $3, $4)",
    [shopId, actorId, orderId, { from: current, to: status, reason }]
  );
}

export async function listShipments(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const statusFilter = input.status ? "and sh.status = $3" : "";
  if (input.status) values.push(input.status);

  const shipments = await db.query(
    `
      select sh.id, sh.shop_id, sh.order_id, sh.provider, sh.status, sh.courier_name, sh.tracking_number,
        sh.fee, sh.booking_source, sh.booked_at, sh.last_sync_at, sh.created_at, sh.updated_at,
        o.status as order_status, o.buyer_snapshot
      from shipments sh
      join orders o on o.id = sh.order_id and o.shop_id = sh.shop_id
      where sh.shop_id = $1 ${statusFilter}
      order by sh.created_at desc
      limit $2
    `,
    values
  );
  return { shipments: shipments.rows };
}

export async function getShipment(shopId: string, shipmentId: string) {
  const shipment = await db.query(
    `
      select sh.id, sh.shop_id, sh.order_id, sh.provider, sh.status, sh.courier_name, sh.tracking_number,
        sh.fee, sh.booking_source, sh.booked_by, sh.booked_at, sh.last_sync_at, sh.metadata,
        sh.created_at, sh.updated_at, o.status as order_status, o.buyer_snapshot
      from shipments sh
      join orders o on o.id = sh.order_id and o.shop_id = sh.shop_id
      where sh.shop_id = $1 and sh.id = $2
    `,
    [shopId, shipmentId]
  );
  if (!shipment.rowCount) throw new DeliveryError("Shipment not found.", 404, "SHIPMENT_NOT_FOUND");

  const events = await db.query(
    "select id, status, source, note, payload, created_by, created_at from shipment_tracking_events where shop_id = $1 and shipment_id = $2 order by created_at asc",
    [shopId, shipmentId]
  );
  const failures = await db.query(
    "select id, reason, contact_result, reschedule_date, status, resolved_at, created_at from failed_deliveries where shop_id = $1 and shipment_id = $2 order by created_at desc",
    [shopId, shipmentId]
  );
  return { shipment: shipment.rows[0], events: events.rows, failedDeliveries: failures.rows };
}

export async function createManualShipment(
  shopId: string,
  input: { orderId: string; courierName: string; trackingNumber?: string; fee: number; note?: string },
  actorId: string
) {
  const client = await db.connect();
  let shipmentId = "";
  try {
    await client.query("begin");
    const order = await client.query("select id, status, buyer_snapshot from orders where shop_id = $1 and id = $2 for update", [shopId, input.orderId]);
    if (!order.rowCount) throw new DeliveryError("Order not found.", 404, "ORDER_NOT_FOUND");
    if (order.rows[0].status !== "packed") throw new DeliveryError("Order must be packed before manual shipment.", 409, "ORDER_NOT_PACKED");

    const buyer = order.rows[0].buyer_snapshot as { phone?: string; address?: string };
    if (!buyer.phone || !buyer.address) throw new DeliveryError("Order needs phone and address before shipment.", 409, "SHIPMENT_ADDRESS_INCOMPLETE");

    const shipment = await client.query(
      `
        insert into shipments (shop_id, order_id, provider, status, courier_name, tracking_number, fee, booking_source, booked_by, metadata)
        values ($1, $2, 'manual', 'booked', $3, $4, $5, 'manual', $6, $7)
        returning id
      `,
      [shopId, input.orderId, input.courierName, input.trackingNumber ?? null, input.fee, actorId, { note: input.note }]
    );
    shipmentId = shipment.rows[0].id;

    await client.query(
      "insert into shipment_tracking_events (shop_id, shipment_id, order_id, status, source, note, created_by) values ($1, $2, $3, 'booked', 'manual', $4, $5)",
      [shopId, shipmentId, input.orderId, input.note ?? "Manual shipment booked", actorId]
    );
    await client.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'shipment.manual_booked', 'shipment', $3, $4)",
      [shopId, actorId, shipmentId, { orderId: input.orderId, courierName: input.courierName }]
    );
    await moveOrderForShipment(client, shopId, input.orderId, "shipped", input.note, actorId);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    if ((error as { code?: string }).code === "23505") throw new DeliveryError("Order already has an open shipment.", 409, "SHIPMENT_ALREADY_EXISTS");
    throw error;
  } finally {
    client.release();
  }

  return getShipment(shopId, shipmentId);
}

export async function updateShipmentStatus(shopId: string, shipmentId: string, input: { status: ShipmentStatus; note?: string; contactResult?: string; rescheduleDate?: string }, actorId: string) {
  const client = await db.connect();
  let orderId = "";
  try {
    await client.query("begin");
    const shipment = await client.query("select id, order_id, status from shipments where shop_id = $1 and id = $2 for update", [shopId, shipmentId]);
    if (!shipment.rowCount) throw new DeliveryError("Shipment not found.", 404, "SHIPMENT_NOT_FOUND");

    const current = shipment.rows[0].status as ShipmentStatus;
    orderId = shipment.rows[0].order_id;
    if (current === input.status) throw new DeliveryError("Shipment already has this status.", 409, "SHIPMENT_STATUS_UNCHANGED");
    if (!transitions[current].includes(input.status)) throw new DeliveryError("Shipment status move is not allowed.", 409, "SHIPMENT_STATUS_INVALID");
    if ((input.status === "failed" || input.status === "returned" || input.status === "cancelled") && !input.note) {
      throw new DeliveryError("Reason is required for this shipment status.", 400, "REASON_REQUIRED");
    }

    await client.query("update shipments set status = $3, updated_at = now() where shop_id = $1 and id = $2", [shopId, shipmentId, input.status]);
    await client.query(
      "insert into shipment_tracking_events (shop_id, shipment_id, order_id, status, source, note, created_by) values ($1, $2, $3, $4, 'manual', $5, $6)",
      [shopId, shipmentId, orderId, input.status, input.note ?? null, actorId]
    );
    if (input.status === "failed") {
      await client.query(
        "insert into failed_deliveries (shop_id, shipment_id, order_id, reason, contact_result, reschedule_date, created_by) values ($1, $2, $3, $4, $5, $6, $7)",
        [shopId, shipmentId, orderId, input.note, input.contactResult ?? null, input.rescheduleDate ?? null, actorId]
      );
    }
    if (input.status === "returned") {
      await client.query("update failed_deliveries set status = 'returned', resolved_at = now() where shop_id = $1 and shipment_id = $2 and status = 'open'", [shopId, shipmentId]);
    }
    await client.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'shipment.status_updated', 'shipment', $3, $4)",
      [shopId, actorId, shipmentId, { from: current, to: input.status, reason: input.note }]
    );
    if (input.status === "delivered" || input.status === "returned") {
      await moveOrderForShipment(client, shopId, orderId, input.status, input.note, actorId);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return getShipment(shopId, shipmentId);
}

export async function rescheduleShipment(shopId: string, shipmentId: string, input: { rescheduleDate: string; contactResult: string; note?: string }, actorId: string) {
  const client = await db.connect();
  let orderId = "";
  try {
    await client.query("begin");
    const shipment = await client.query("select id, order_id, status from shipments where shop_id = $1 and id = $2 for update", [shopId, shipmentId]);
    if (!shipment.rowCount) throw new DeliveryError("Shipment not found.", 404, "SHIPMENT_NOT_FOUND");
    if (shipment.rows[0].status !== "failed") throw new DeliveryError("Only failed shipments can be rescheduled.", 409, "SHIPMENT_NOT_FAILED");
    orderId = shipment.rows[0].order_id;
    const issue = await client.query("select id from failed_deliveries where shop_id = $1 and shipment_id = $2 and status = 'open' order by created_at desc limit 1 for update", [shopId, shipmentId]);
    if (!issue.rowCount) throw new DeliveryError("Open failed-delivery issue not found.", 409, "FAILED_DELIVERY_NOT_OPEN");
    await client.query("update failed_deliveries set status = 'rescheduled', contact_result = $3, reschedule_date = $4, resolved_at = now() where shop_id = $1 and id = $2", [shopId, issue.rows[0].id, input.contactResult, input.rescheduleDate]);
    await client.query("update shipments set status = 'in_transit', updated_at = now() where shop_id = $1 and id = $2", [shopId, shipmentId]);
    const note = input.note ?? `Rescheduled for ${input.rescheduleDate}`;
    await client.query("insert into shipment_tracking_events (shop_id, shipment_id, order_id, status, source, note, created_by) values ($1, $2, $3, 'rescheduled', 'manual', $4, $5)", [shopId, shipmentId, orderId, note, actorId]);
    await client.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'shipment.rescheduled', 'shipment', $3, $4)", [shopId, actorId, shipmentId, JSON.stringify({ orderId, rescheduleDate: input.rescheduleDate, contactResult: input.contactResult })]);
    await client.query("insert into order_timeline (shop_id, order_id, status, actor_type, actor_id, note) values ($1, $2, 'rescheduled', 'staff', $3, $4)", [shopId, orderId, actorId, note]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
  return getShipment(shopId, shipmentId);
}
