import { db } from "../../shared/db.js";

export class PaymentError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) {
    super(message);
  }
}

export async function listPayments(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const statusFilter = input.status ? "and pr.status = $3" : "";
  if (input.status) values.push(input.status);
  const result = await db.query(
    `select pr.id, pr.shop_id, pr.order_id, pr.method, pr.status, pr.amount, pr.currency,
      pr.proof_asset_id, pr.marked_paid_at, pr.refunded_at, pr.note, pr.created_by, pr.created_at, pr.updated_at
     from payment_records pr where pr.shop_id = $1 ${statusFilter}
     order by pr.created_at desc limit $2`,
    values
  );
  return { payments: result.rows };
}

export async function getPayment(shopId: string, paymentId: string) {
  const payment = await db.query(
    "select id, shop_id, order_id, method, status, amount, currency, proof_asset_id, marked_paid_at, refunded_at, note, created_by, created_at, updated_at from payment_records where shop_id = $1 and id = $2",
    [shopId, paymentId]
  );
  if (!payment.rowCount) throw new PaymentError("Payment not found.", 404, "PAYMENT_NOT_FOUND");
  const events = await db.query(
    "select id, event_type, amount, note, actor_id, created_at from payment_events where shop_id = $1 and payment_id = $2 order by created_at asc",
    [shopId, paymentId]
  );
  return { payment: payment.rows[0], events: events.rows };
}

export async function markOrderPaid(
  shopId: string,
  orderId: string,
  input: { method: "cod" | "advance" | "manual"; amount?: number; proofAssetId?: string; note: string },
  actorId: string
) {
  const client = await db.connect();
  let paymentId = "";
  try {
    await client.query("begin");
    const order = await client.query("select id, total, currency, status from orders where shop_id = $1 and id = $2 for update", [shopId, orderId]);
    if (!order.rowCount) throw new PaymentError("Order not found.", 404, "ORDER_NOT_FOUND");
    if (["cancelled", "returned"].includes(order.rows[0].status)) throw new PaymentError("Cancelled or returned orders cannot be marked paid.", 409, "ORDER_NOT_PAYABLE");
    const amount = input.amount ?? Number(order.rows[0].total);
    const paid = await client.query("select coalesce(sum(amount), 0) as total from payment_records where shop_id = $1 and order_id = $2 and status = 'marked_paid'", [shopId, orderId]);
    if (amount + Number(paid.rows[0].total) > Number(order.rows[0].total)) throw new PaymentError("Payments cannot exceed the order total.", 400, "PAYMENT_EXCEEDS_TOTAL");
    if (input.proofAssetId) {
      const proof = await client.query("select id from asset_objects where shop_id = $1 and id = $2", [shopId, input.proofAssetId]);
      if (!proof.rowCount) throw new PaymentError("Proof asset not found for this shop.", 404, "PROOF_ASSET_NOT_FOUND");
    }
    const payment = await client.query(
      `insert into payment_records (shop_id, order_id, method, status, amount, currency, proof_asset_id, marked_paid_at, note, created_by)
       values ($1, $2, $3, 'marked_paid', $4, $5, $6, now(), $7, $8) returning id`,
      [shopId, orderId, input.method, amount, order.rows[0].currency, input.proofAssetId ?? null, input.note, actorId]
    );
    paymentId = payment.rows[0].id;
    await client.query(
      "insert into payment_events (shop_id, payment_id, order_id, event_type, amount, note, actor_id) values ($1, $2, $3, 'created', $4, $5, $6)",
      [shopId, paymentId, orderId, amount, input.note, actorId]
    );
    await client.query(
      "insert into payment_events (shop_id, payment_id, order_id, event_type, amount, note, actor_id) values ($1, $2, $3, 'marked_paid', $4, $5, $6)",
      [shopId, paymentId, orderId, amount, input.note, actorId]
    );
    await writeAudit(client, shopId, actorId, "payment.marked_paid", "payment", paymentId, { orderId, amount, method: input.method, bankConfirmed: false, note: input.note });
    await client.query(
      "insert into order_timeline (shop_id, order_id, status, actor_type, actor_id, note) values ($1, $2, 'payment_marked_paid', 'staff', $3, $4)",
      [shopId, orderId, actorId, input.note]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getPayment(shopId, paymentId);
}

export async function refundPayment(shopId: string, paymentId: string, input: { amount?: number; note: string }, actorId: string) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const payment = await client.query("select id, order_id, status, amount from payment_records where shop_id = $1 and id = $2 for update", [shopId, paymentId]);
    if (!payment.rowCount) throw new PaymentError("Payment not found.", 404, "PAYMENT_NOT_FOUND");
    if (payment.rows[0].status !== "marked_paid") throw new PaymentError("Only marked-paid payments can be refunded.", 409, "PAYMENT_NOT_REFUNDABLE");
    const amount = input.amount ?? Number(payment.rows[0].amount);
    if (amount > Number(payment.rows[0].amount)) throw new PaymentError("Refund cannot exceed the payment amount.", 400, "REFUND_EXCEEDS_PAYMENT");
    if (amount !== Number(payment.rows[0].amount)) throw new PaymentError("Partial refunds are not enabled yet.", 409, "PARTIAL_REFUND_UNSUPPORTED");
    await client.query("update payment_records set status = 'refunded', refunded_at = now(), updated_at = now(), note = $3 where shop_id = $1 and id = $2", [shopId, paymentId, input.note]);
    await client.query(
      "insert into payment_events (shop_id, payment_id, order_id, event_type, amount, note, actor_id) values ($1, $2, $3, 'refunded', $4, $5, $6)",
      [shopId, paymentId, payment.rows[0].order_id, amount, input.note, actorId]
    );
    await writeAudit(client, shopId, actorId, "payment.refunded", "payment", paymentId, { orderId: payment.rows[0].order_id, amount, note: input.note });
    await client.query(
      "insert into order_timeline (shop_id, order_id, status, actor_type, actor_id, note) values ($1, $2, 'payment_refunded', 'staff', $3, $4)",
      [shopId, payment.rows[0].order_id, actorId, input.note]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getPayment(shopId, paymentId);
}

async function writeAudit(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, shopId: string, actorId: string, action: string, targetType: string, targetId: string, metadata: unknown) {
  await client.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, $4, $5, $6)",
    [shopId, actorId, action, targetType, targetId, JSON.stringify(metadata)]
  );
}
