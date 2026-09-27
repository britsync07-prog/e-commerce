import { db } from "../../shared/db.js";
import type pg from "pg";

type OrderStatus = "new" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled" | "returned";

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: []
};

export class OrderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

export async function submitCheckout(input: {
  subdomain: string;
  customer: { name: string; phone: string; address: string; city?: string; area?: string };
  items: { variantId: string; quantity: number }[];
  paymentMethod: "cod";
}) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const shop = await client.query("select id, currency, policy_defaults from shops where subdomain = $1 and status = 'launched'", [input.subdomain]);
    if (!shop.rowCount) throw new OrderError("Published shop not found.", 404, "SHOP_NOT_FOUND");
    const shopId = shop.rows[0].id as string;
    const currency = shop.rows[0].currency as string;
    const policy = shop.rows[0].policy_defaults as { deliveryCharge?: number; codAllowed?: boolean };
    if (policy.codAllowed === false) throw new OrderError("COD is not available for this shop.", 409, "COD_NOT_ALLOWED");

    const customer = await client.query(
      `
        insert into customers (shop_id, name, phone)
        values ($1, $2, $3)
        on conflict (shop_id, phone) do update set name = excluded.name, updated_at = now()
        returning id, name, phone
      `,
      [shopId, input.customer.name, input.customer.phone]
    );
    await client.query(
      "insert into customer_addresses (shop_id, customer_id, address, city, area) values ($1, $2, $3, $4, $5)",
      [shopId, customer.rows[0].id, input.customer.address, input.customer.city ?? null, input.customer.area ?? null]
    );

    let subtotal = 0;
    const preparedItems = [];
    for (const item of input.items) {
      const variant = await client.query(
        `
          select pv.id as variant_id, pv.title, pv.price, p.id as product_id, p.name as product_name, p.slug,
            coalesce(sum(il.delta_quantity), 0)::int as stock
          from product_variants pv
          join products p on p.id = pv.product_id
          left join inventory_ledger il on il.variant_id = pv.id
          where pv.shop_id = $1 and pv.id = $2 and pv.status = 'active' and p.status = 'active'
          group by pv.id, p.id
        `,
        [shopId, item.variantId]
      );
      if (!variant.rowCount) throw new OrderError("Product variant not found.", 404, "VARIANT_NOT_FOUND");
      if (Number(variant.rows[0].stock) < item.quantity) throw new OrderError("Stock unavailable.", 409, "STOCK_UNAVAILABLE");
      const unitPrice = Number(variant.rows[0].price);
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      preparedItems.push({ ...variant.rows[0], quantity: item.quantity, unitPrice, lineTotal });
    }

    const deliveryCharge = Number(policy.deliveryCharge ?? 0);
    const total = subtotal + deliveryCharge;
    const order = await client.query(
      `
        insert into orders (shop_id, customer_id, source, status, payment_method, currency, subtotal, delivery_charge, total, buyer_snapshot)
        values ($1, $2, 'storefront', 'confirmed', $3, $4, $5, $6, $7, $8)
        returning id, shop_id, status, currency, subtotal, delivery_charge, total, created_at
      `,
      [
        shopId,
        customer.rows[0].id,
        input.paymentMethod,
        currency,
        subtotal,
        deliveryCharge,
        total,
        { name: input.customer.name, phone: input.customer.phone, address: input.customer.address, city: input.customer.city, area: input.customer.area }
      ]
    );

    for (const item of preparedItems) {
      await client.query(
        `
          insert into order_items (shop_id, order_id, product_id, variant_id, quantity, unit_price, line_total, product_snapshot)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          shopId,
          order.rows[0].id,
          item.product_id,
          item.variant_id,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
          { productName: item.product_name, slug: item.slug, variantTitle: item.title, unitPrice: item.unitPrice, currency }
        ]
      );
      await client.query(
        `
          insert into inventory_ledger (shop_id, variant_id, reason, delta_quantity, quantity_after, reference_type, reference_id, created_by)
          values ($1, $2, 'order_confirmed', $3, $4, 'order', $5, 'checkout')
        `,
        [shopId, item.variant_id, -item.quantity, Number(item.stock) - item.quantity, order.rows[0].id]
      );
    }

    await client.query(
      "insert into order_timeline (shop_id, order_id, status, actor_type, actor_id, note) values ($1, $2, 'confirmed', 'buyer', $3, 'Storefront checkout submitted')",
      [shopId, order.rows[0].id, input.customer.phone]
    );
    await client.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'buyer', $2, 'order.confirmed', 'order', $3, $4)",
      [shopId, input.customer.phone, order.rows[0].id, { source: "storefront", itemCount: preparedItems.length }]
    );

    await client.query("commit");
    return getOrderForBuyer(order.rows[0].id, input.customer.phone);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getOrderForBuyer(orderId: string, phone: string) {
  const order = await db.query(
    `
      select o.id, o.shop_id, s.display_name as shop_name, o.status, o.currency, o.subtotal, o.delivery_charge, o.total,
        o.payment_method, o.buyer_snapshot, o.created_at
      from orders o
      join shops s on s.id = o.shop_id
      where o.id = $1 and o.buyer_snapshot->>'phone' = $2
    `,
    [orderId, phone]
  );
  if (!order.rowCount) throw new OrderError("Order not found.", 404, "ORDER_NOT_FOUND");

  const items = await db.query(
    "select id, product_id, variant_id, quantity, unit_price, line_total, product_snapshot from order_items where order_id = $1 order by created_at asc",
    [orderId]
  );
  const timeline = await db.query("select status, note, created_at from order_timeline where order_id = $1 order by created_at asc", [orderId]);
  return { order: order.rows[0], items: items.rows, timeline: timeline.rows };
}

type DraftCustomer = { name?: string; phone?: string; address?: string; city?: string; area?: string };
type DraftItem = { variantId: string; quantity: number; confidence?: number };

export async function listOrderDrafts(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const statusFilter = input.status ? "and od.status = $3" : "";
  if (input.status) values.push(input.status);

  const drafts = await db.query(
    `
      select od.id, od.shop_id, od.conversation_id, od.status, od.customer_snapshot, od.payment_method,
        od.risk_status, od.risk_reasons, od.confidence, od.confirmed_order_id, od.created_at, od.updated_at,
        count(odi.id)::int as item_count
      from order_drafts od
      left join order_draft_items odi on odi.order_draft_id = od.id
      where od.shop_id = $1 ${statusFilter}
      group by od.id
      order by od.created_at desc
      limit $2
    `,
    values
  );
  return { drafts: drafts.rows };
}

export async function getOrderDraft(shopId: string, draftId: string) {
  const draft = await db.query(
    `
      select id, shop_id, conversation_id, status, customer_snapshot, payment_method,
        risk_status, risk_reasons, confidence, created_by, confirmed_order_id, created_at, updated_at
      from order_drafts
      where shop_id = $1 and id = $2
    `,
    [shopId, draftId]
  );
  if (!draft.rowCount) throw new OrderError("Order draft not found.", 404, "ORDER_DRAFT_NOT_FOUND");

  const items = await db.query(
    `
      select odi.id, odi.variant_id, odi.quantity, odi.confidence, pv.title, pv.price, p.name as product_name,
        coalesce(sum(il.delta_quantity), 0)::int as stock
      from order_draft_items odi
      join product_variants pv on pv.id = odi.variant_id
      join products p on p.id = pv.product_id
      left join inventory_ledger il on il.variant_id = pv.id
      where odi.shop_id = $1 and odi.order_draft_id = $2
      group by odi.id, pv.id, p.id
      order by odi.created_at asc
    `,
    [shopId, draftId]
  );
  return { draft: draft.rows[0], items: items.rows };
}

export async function createOrderDraft(
  shopId: string,
  input: { conversationId?: string; customer: DraftCustomer; items: DraftItem[]; paymentMethod: "cod"; confidence: number },
  actorId: string
) {
  const client = await db.connect();
  let draftId = "";
  try {
    await client.query("begin");
    await ensureConversation(client, shopId, input.conversationId);
    const risk = riskForDraft(input.customer, input.items);
    const draft = await client.query(
      `
        insert into order_drafts (shop_id, conversation_id, customer_snapshot, payment_method, risk_status, risk_reasons, confidence, created_by, status)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning id
      `,
      [
        shopId,
        input.conversationId ?? null,
        input.customer,
        input.paymentMethod,
        risk.status,
        JSON.stringify(risk.reasons),
        input.confidence,
        actorId,
        risk.reasons.length ? "draft" : "ready"
      ]
    );
    draftId = draft.rows[0].id;
    await replaceDraftItems(client, shopId, draftId, input.items);
    await writeDraftAudit(client, shopId, actorId, "order_draft.created", draftId, { conversationId: input.conversationId });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getOrderDraft(shopId, draftId);
}

export async function updateOrderDraft(
  shopId: string,
  draftId: string,
  input: { customer?: DraftCustomer; items?: DraftItem[]; status?: "draft" | "ready" | "cancelled"; confidence?: number },
  actorId: string
) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const current = await client.query("select id, status, customer_snapshot, confidence from order_drafts where shop_id = $1 and id = $2 for update", [shopId, draftId]);
    if (!current.rowCount) throw new OrderError("Order draft not found.", 404, "ORDER_DRAFT_NOT_FOUND");
    if (current.rows[0].status === "confirmed") throw new OrderError("Confirmed draft cannot be edited.", 409, "ORDER_DRAFT_CONFIRMED");

    if (input.items) await replaceDraftItems(client, shopId, draftId, input.items);
    const items = input.items ?? (await currentDraftItems(client, shopId, draftId));
    const customer = { ...(current.rows[0].customer_snapshot as DraftCustomer), ...(input.customer ?? {}) };
    const risk = riskForDraft(customer, items);
    const nextStatus = input.status ?? (risk.reasons.length ? "draft" : "ready");
    if (nextStatus === "ready" && risk.reasons.length) throw new OrderError("Draft is missing required fields.", 409, "ORDER_DRAFT_INCOMPLETE");

    await client.query(
      `
        update order_drafts
        set customer_snapshot = $3, confidence = $4, risk_status = $5, risk_reasons = $6, status = $7, updated_at = now()
        where shop_id = $1 and id = $2
      `,
      [shopId, draftId, customer, input.confidence ?? current.rows[0].confidence, risk.status, JSON.stringify(risk.reasons), nextStatus]
    );
    await writeDraftAudit(client, shopId, actorId, nextStatus === "cancelled" ? "order_draft.cancelled" : "order_draft.updated", draftId, { status: nextStatus });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getOrderDraft(shopId, draftId);
}

export async function confirmOrderDraft(shopId: string, draftId: string, actorId: string) {
  const client = await db.connect();
  let orderId = "";
  let phone = "";
  try {
    await client.query("begin");
    const draft = await client.query(
      "select id, conversation_id, status, customer_snapshot, payment_method from order_drafts where shop_id = $1 and id = $2 for update",
      [shopId, draftId]
    );
    if (!draft.rowCount) throw new OrderError("Order draft not found.", 404, "ORDER_DRAFT_NOT_FOUND");
    if (draft.rows[0].status === "confirmed") throw new OrderError("Draft already confirmed.", 409, "ORDER_DRAFT_CONFIRMED");
    if (draft.rows[0].status === "cancelled") throw new OrderError("Cancelled draft cannot be confirmed.", 409, "ORDER_DRAFT_CANCELLED");

    const customer = draft.rows[0].customer_snapshot as DraftCustomer;
    const draftItems = await currentDraftItems(client, shopId, draftId);
    const risk = riskForDraft(customer, draftItems);
    if (risk.reasons.length) throw new OrderError("Draft is missing required fields.", 409, "ORDER_DRAFT_INCOMPLETE");
    phone = customer.phone as string;

    const shop = await client.query("select currency, policy_defaults from shops where id = $1", [shopId]);
    if (!shop.rowCount) throw new OrderError("Shop not found.", 404, "SHOP_NOT_FOUND");
    const currency = shop.rows[0].currency as string;
    const policy = shop.rows[0].policy_defaults as { deliveryCharge?: number; codAllowed?: boolean };
    if (policy.codAllowed === false) throw new OrderError("COD is not available for this shop.", 409, "COD_NOT_ALLOWED");

    const customerRow = await client.query(
      `
        insert into customers (shop_id, name, phone)
        values ($1, $2, $3)
        on conflict (shop_id, phone) do update set name = excluded.name, updated_at = now()
        returning id
      `,
      [shopId, customer.name, customer.phone]
    );
    await client.query("insert into customer_addresses (shop_id, customer_id, address, city, area) values ($1, $2, $3, $4, $5)", [
      shopId,
      customerRow.rows[0].id,
      customer.address,
      customer.city ?? null,
      customer.area ?? null
    ]);

    const preparedItems = [];
    let subtotal = 0;
    for (const item of draftItems) {
      const variant = await client.query(
        `
          select pv.id as variant_id, pv.title, pv.price, p.id as product_id, p.name as product_name, p.slug,
            coalesce(sum(il.delta_quantity), 0)::int as stock
          from product_variants pv
          join products p on p.id = pv.product_id
          left join inventory_ledger il on il.variant_id = pv.id
          where pv.shop_id = $1 and pv.id = $2 and pv.status = 'active' and p.status = 'active'
          group by pv.id, p.id
        `,
        [shopId, item.variantId]
      );
      if (!variant.rowCount) throw new OrderError("Product variant not found.", 404, "VARIANT_NOT_FOUND");
      if (Number(variant.rows[0].stock) < item.quantity) throw new OrderError("Stock unavailable.", 409, "STOCK_UNAVAILABLE");
      const unitPrice = Number(variant.rows[0].price);
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      preparedItems.push({ ...variant.rows[0], quantity: item.quantity, unitPrice, lineTotal });
    }

    const deliveryCharge = Number(policy.deliveryCharge ?? 0);
    const total = subtotal + deliveryCharge;
    const order = await client.query(
      `
        insert into orders (shop_id, customer_id, source, status, payment_method, currency, subtotal, delivery_charge, total, buyer_snapshot)
        values ($1, $2, $3, 'confirmed', $4, $5, $6, $7, $8, $9)
        returning id
      `,
      [
        shopId,
        customerRow.rows[0].id,
        draft.rows[0].conversation_id ? "chat" : "manual",
        draft.rows[0].payment_method,
        currency,
        subtotal,
        deliveryCharge,
        total,
        customer
      ]
    );
    orderId = order.rows[0].id;

    for (const item of preparedItems) {
      await client.query(
        `
          insert into order_items (shop_id, order_id, product_id, variant_id, quantity, unit_price, line_total, product_snapshot)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          shopId,
          orderId,
          item.product_id,
          item.variant_id,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
          { productName: item.product_name, slug: item.slug, variantTitle: item.title, unitPrice: item.unitPrice, currency }
        ]
      );
      await client.query(
        `
          insert into inventory_ledger (shop_id, variant_id, reason, delta_quantity, quantity_after, reference_type, reference_id, created_by)
          values ($1, $2, 'order_confirmed', $3, $4, 'order', $5, $6)
        `,
        [shopId, item.variant_id, -item.quantity, Number(item.stock) - item.quantity, orderId, actorId]
      );
    }

    await client.query("update order_drafts set status = 'confirmed', confirmed_order_id = $3, updated_at = now() where shop_id = $1 and id = $2", [
      shopId,
      draftId,
      orderId
    ]);
    await client.query(
      "insert into order_timeline (shop_id, order_id, status, actor_type, actor_id, note) values ($1, $2, 'confirmed', 'staff', $3, 'Order draft confirmed')",
      [shopId, orderId, actorId]
    );
    await client.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'order_draft.confirmed', 'order_draft', $3, $4)",
      [shopId, actorId, draftId, { orderId }]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getOrderForBuyer(orderId, phone);
}

export async function listOrders(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const statusFilter = input.status ? "and o.status = $3" : "";
  if (input.status) values.push(input.status);
  const orders = await db.query(
    `
      select o.id, o.shop_id, o.status, o.currency, o.subtotal, o.delivery_charge, o.total,
        o.payment_method, o.buyer_snapshot, o.created_at, o.updated_at,
        count(oi.id)::int as item_count
      from orders o
      left join order_items oi on oi.order_id = o.id
      where o.shop_id = $1 ${statusFilter}
      group by o.id
      order by o.created_at desc
      limit $2
    `,
    values
  );
  return { orders: orders.rows };
}

export async function getOrderForStaff(shopId: string, orderId: string) {
  const order = await db.query(
    `
      select o.id, o.shop_id, o.status, o.currency, o.subtotal, o.delivery_charge, o.total,
        o.payment_method, o.buyer_snapshot, o.created_at, o.updated_at
      from orders o
      where o.shop_id = $1 and o.id = $2
    `,
    [shopId, orderId]
  );
  if (!order.rowCount) throw new OrderError("Order not found.", 404, "ORDER_NOT_FOUND");

  const items = await db.query(
    "select id, product_id, variant_id, quantity, unit_price, line_total, product_snapshot from order_items where shop_id = $1 and order_id = $2 order by created_at asc",
    [shopId, orderId]
  );
  const timeline = await db.query("select status, actor_type, actor_id, note, created_at from order_timeline where shop_id = $1 and order_id = $2 order by created_at asc", [
    shopId,
    orderId
  ]);
  return { order: order.rows[0], items: items.rows, timeline: timeline.rows };
}

export async function updateOrderStatus(shopId: string, orderId: string, input: { status: OrderStatus; reason?: string }, actorId: string) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const order = await client.query("select id, status from orders where shop_id = $1 and id = $2 for update", [shopId, orderId]);
    if (!order.rowCount) throw new OrderError("Order not found.", 404, "ORDER_NOT_FOUND");

    const currentStatus = order.rows[0].status as OrderStatus;
    if (currentStatus === input.status) throw new OrderError("Order already has this status.", 409, "ORDER_STATUS_UNCHANGED");
    if (!allowedTransitions[currentStatus].includes(input.status)) throw new OrderError("Order status move is not allowed.", 409, "ORDER_STATUS_INVALID");
    if ((input.status === "cancelled" || input.status === "returned") && !input.reason) {
      throw new OrderError("Reason is required for cancellation or return.", 400, "REASON_REQUIRED");
    }

    await client.query("update orders set status = $3, updated_at = now() where shop_id = $1 and id = $2", [shopId, orderId, input.status]);

    if (input.status === "cancelled" || input.status === "returned") {
      const items = await client.query("select variant_id, quantity from order_items where shop_id = $1 and order_id = $2", [shopId, orderId]);
      for (const item of items.rows) {
        const current = await client.query("select coalesce(sum(delta_quantity), 0)::int as quantity from inventory_ledger where shop_id = $1 and variant_id = $2", [
          shopId,
          item.variant_id
        ]);
        const quantityAfter = Number(current.rows[0].quantity) + Number(item.quantity);
        await client.query(
          `
          insert into inventory_ledger (shop_id, variant_id, reason, delta_quantity, quantity_after, reference_type, reference_id, created_by)
            values ($1, $2, $7, $3, $4, 'order', $5, $6)
          `,
          [shopId, item.variant_id, Number(item.quantity), quantityAfter, orderId, actorId, input.status === "cancelled" ? "order_cancelled" : "order_returned"]
        );
      }
    }

    await client.query(
      "insert into order_timeline (shop_id, order_id, status, actor_type, actor_id, note) values ($1, $2, $3, 'staff', $4, $5)",
      [shopId, orderId, input.status, actorId, input.reason ?? null]
    );
    await client.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'order.status_updated', 'order', $3, $4)",
      [shopId, actorId, orderId, { from: currentStatus, to: input.status, reason: input.reason }]
    );

    await client.query("commit");
    return getOrderForStaff(shopId, orderId);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureConversation(client: pg.PoolClient, shopId: string, conversationId?: string) {
  if (!conversationId) return;
  const conversation = await client.query("select 1 from conversations where shop_id = $1 and id = $2", [shopId, conversationId]);
  if (!conversation.rowCount) throw new OrderError("Conversation not found.", 404, "CONVERSATION_NOT_FOUND");
}

async function replaceDraftItems(client: pg.PoolClient, shopId: string, draftId: string, items: DraftItem[]) {
  await client.query("delete from order_draft_items where shop_id = $1 and order_draft_id = $2", [shopId, draftId]);
  for (const item of items) {
    const variant = await client.query("select 1 from product_variants where shop_id = $1 and id = $2", [shopId, item.variantId]);
    if (!variant.rowCount) throw new OrderError("Product variant not found.", 404, "VARIANT_NOT_FOUND");
    await client.query(
      "insert into order_draft_items (shop_id, order_draft_id, variant_id, quantity, confidence) values ($1, $2, $3, $4, $5)",
      [shopId, draftId, item.variantId, item.quantity, item.confidence ?? 0.5]
    );
  }
}

async function currentDraftItems(client: pg.PoolClient, shopId: string, draftId: string): Promise<DraftItem[]> {
  const items = await client.query("select variant_id, quantity, confidence from order_draft_items where shop_id = $1 and order_draft_id = $2 order by created_at asc", [
    shopId,
    draftId
  ]);
  return items.rows.map((item) => ({ variantId: item.variant_id, quantity: Number(item.quantity), confidence: Number(item.confidence) }));
}

function riskForDraft(customer: DraftCustomer, items: DraftItem[]) {
  const reasons = [];
  if (!customer.name) reasons.push("customer_name_missing");
  if (!customer.phone) reasons.push("phone_missing");
  if (!customer.address) reasons.push("address_missing");
  if (!items.length) reasons.push("items_missing");
  return { status: reasons.length ? ("review" as const) : ("safe" as const), reasons };
}

async function writeDraftAudit(client: pg.PoolClient, shopId: string, actorId: string, action: string, draftId: string, metadata: Record<string, unknown>) {
  await client.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, 'order_draft', $4, $5)",
    [shopId, actorId, action, draftId, metadata]
  );
}
