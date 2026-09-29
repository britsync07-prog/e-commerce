import { db } from "../../shared/db.js";
import type pg from "pg";
import { lockInventoryVariants } from "../../shared/inventory-lock.js";
import { createHash, randomBytes } from "node:crypto";
import { createManualShipment, DeliveryError } from "../delivery/delivery.service.js";

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
  couponCode?: string;
  attribution?: { source: string; campaignId?: string; data?: Record<string, unknown> };
  paymentMethod: "cod";
}, idempotencyKey?: string) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const shop = await client.query("select id, currency, policy_defaults from shops where subdomain = $1 and status = 'launched'", [input.subdomain]);
    if (!shop.rowCount) throw new OrderError("Published shop not found.", 404, "SHOP_NOT_FOUND");
    const shopId = shop.rows[0].id as string;
    const replay = idempotencyKey ? await reserveCheckoutIdempotency(client, shopId, idempotencyKey, input) : undefined;
    if (replay) {
      await client.query("rollback");
      return getOrderForBuyer(replay.orderId, replay.phone);
    }
    const currency = shop.rows[0].currency as string;
    const policy = shop.rows[0].policy_defaults as { deliveryCharge?: number; codAllowed?: boolean };
    if (policy.codAllowed === false) throw new OrderError("COD is not available for this shop.", 409, "COD_NOT_ALLOWED");

    await lockInventoryVariants(client, shopId, input.items.map((item) => item.variantId));
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

    let discountAmount = 0;
    let couponId: string | null = null;
    if (input.couponCode) {
      const coupon = await client.query("select id, discount_type, discount_value, min_order_total, usage_limit, usage_count, expires_at from coupons where shop_id = $1 and code = $2 and status = 'active' for update", [shopId, input.couponCode.toUpperCase()]);
      if (!coupon.rowCount) throw new OrderError("Coupon is invalid or disabled.", 400, "COUPON_INVALID");
      const row = coupon.rows[0];
      if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) throw new OrderError("Coupon has expired.", 400, "COUPON_EXPIRED");
      if (row.usage_limit !== null && Number(row.usage_count) >= Number(row.usage_limit)) throw new OrderError("Coupon usage limit reached.", 409, "COUPON_USAGE_LIMIT");
      if (subtotal < Number(row.min_order_total)) throw new OrderError("Order does not meet the coupon minimum.", 400, "COUPON_MINIMUM_NOT_MET");
      discountAmount = row.discount_type === "percent" ? subtotal * Number(row.discount_value) / 100 : Number(row.discount_value);
      discountAmount = Math.min(subtotal, Math.max(0, Number(discountAmount.toFixed(2))));
      couponId = row.id;
    }
    const deliveryCharge = Number(policy.deliveryCharge ?? 0);
    const total = subtotal - discountAmount + deliveryCharge;
    const order = await client.query(
      `
        insert into orders (shop_id, customer_id, source, status, payment_method, currency, subtotal, delivery_charge, discount_amount, total, coupon_id, buyer_snapshot, attribution_source, attribution_campaign_id, attribution_data)
        values ($1, $2, 'storefront', 'confirmed', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        returning id, shop_id, status, currency, subtotal, delivery_charge, discount_amount, total, coupon_id, created_at
      `,
      [
        shopId,
        customer.rows[0].id,
        input.paymentMethod,
        currency,
        subtotal,
        deliveryCharge,
        discountAmount,
        total,
        couponId,
        { name: input.customer.name, phone: input.customer.phone, address: input.customer.address, city: input.customer.city, area: input.customer.area },
        input.attribution?.source ?? "unknown",
        input.attribution?.campaignId ?? null,
        input.attribution?.data ?? {}
      ]
    );

    if (couponId) {
      await client.query("update coupons set usage_count = usage_count + 1, updated_at = now() where shop_id = $1 and id = $2", [shopId, couponId]);
      await client.query("insert into coupon_redemptions (shop_id, coupon_id, order_id, customer_id, amount) values ($1, $2, $3, $4, $5)", [shopId, couponId, order.rows[0].id, customer.rows[0].id, discountAmount]);
    }

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
    if (idempotencyKey) {
      await client.query(
        "update api_idempotency_keys set status = 'completed', response_body = $4 where shop_id = $1 and operation = 'checkout' and idempotency_key = $2 and request_hash = $3",
        [shopId, idempotencyKey, checkoutRequestHash(input), { orderId: order.rows[0].id, phone: input.customer.phone }]
      );
    }

    await client.query("commit");
    return getOrderForBuyer(order.rows[0].id, input.customer.phone);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function reserveCheckoutIdempotency(client: pg.PoolClient, shopId: string, key: string, input: unknown) {
  if (!key.trim() || key.length > 200) throw new OrderError("Idempotency-Key must be 1-200 characters.", 400, "INVALID_IDEMPOTENCY_KEY");
  const hash = checkoutRequestHash(input);
  const inserted = await client.query(
    `insert into api_idempotency_keys (shop_id, operation, idempotency_key, request_hash, status)
     values ($1, 'checkout', $2, $3, 'processing')
     on conflict (shop_id, operation, idempotency_key) do nothing
     returning id`,
    [shopId, key, hash]
  );
  if (inserted.rowCount) return undefined;
  const existing = await client.query(
    "select request_hash, status, response_body from api_idempotency_keys where shop_id = $1 and operation = 'checkout' and idempotency_key = $2 for update",
    [shopId, key]
  );
  if (!existing.rowCount) throw new OrderError("Idempotency key could not be reserved.", 409, "IDEMPOTENCY_RETRY");
  if (existing.rows[0].request_hash !== hash) throw new OrderError("Idempotency-Key was already used with a different request.", 409, "IDEMPOTENCY_KEY_REUSED");
  const response = existing.rows[0].response_body as { orderId?: string; phone?: string } | null;
  if (existing.rows[0].status === "completed" && response?.orderId && response.phone) return response as { orderId: string; phone: string };
  throw new OrderError("Checkout retry is already being processed.", 409, "IDEMPOTENCY_IN_PROGRESS");
}

function checkoutRequestHash(input: unknown) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
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
type BulkAction = "print" | "book" | "export";

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

export async function createOrderDraftFromMessage(
  shopId: string,
  input: { conversationId?: string; message: string },
  actorId: string
) {
  const extracted = await extractDraftFields(shopId, input.message);
  return createOrderDraft(
    shopId,
    { conversationId: input.conversationId, customer: extracted.customer, items: extracted.items, paymentMethod: "cod", confidence: extracted.confidence },
    actorId
  );
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
    await lockInventoryVariants(client, shopId, draftItems.map((item) => item.variantId));

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

export async function createCheckoutLink(
  shopId: string,
  draftId: string,
  input: { expiresInMinutes: number },
  actorId: string
) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const draft = await client.query("select id, status from order_drafts where shop_id = $1 and id = $2 for update", [shopId, draftId]);
    if (!draft.rowCount) throw new OrderError("Order draft not found.", 404, "ORDER_DRAFT_NOT_FOUND");
    if (draft.rows[0].status === "confirmed") throw new OrderError("Confirmed draft cannot get a checkout link.", 409, "ORDER_DRAFT_CONFIRMED");
    if (draft.rows[0].status === "cancelled") throw new OrderError("Cancelled draft cannot get a checkout link.", 409, "ORDER_DRAFT_CANCELLED");

    const token = randomBytes(32).toString("base64url");
    const link = await client.query(
      `
        insert into order_checkout_links (shop_id, order_draft_id, token, expires_at, created_by)
        values ($1, $2, $3, now() + ($4::text || ' minutes')::interval, $5)
        returning id, token, status, expires_at, created_at
      `,
      [shopId, draftId, token, input.expiresInMinutes, actorId]
    );
    await writeDraftAudit(client, shopId, actorId, "order_draft.checkout_link_created", draftId, { checkoutLinkId: link.rows[0].id });
    await client.query("commit");
    return { checkoutLink: link.rows[0] };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCheckoutLinkDraft(token: string) {
  const link = await activeCheckoutLink(token);
  const draft = await getOrderDraft(link.shop_id, link.order_draft_id);
  return { checkoutLink: publicCheckoutLink(link), ...draft };
}

export async function updateOrderDraftFromCheckoutLink(token: string, input: { customer: DraftCustomer }) {
  const link = await activeCheckoutLink(token);
  const client = await db.connect();
  try {
    await client.query("begin");
    const current = await client.query("select customer_snapshot from order_drafts where shop_id = $1 and id = $2 for update", [link.shop_id, link.order_draft_id]);
    if (!current.rowCount) throw new OrderError("Order draft not found.", 404, "ORDER_DRAFT_NOT_FOUND");
    const items = await currentDraftItems(client, link.shop_id, link.order_draft_id);
    const customer = { ...(current.rows[0].customer_snapshot as DraftCustomer), ...input.customer };
    const risk = riskForDraft(customer, items);
    await client.query(
      `
        update order_drafts
        set customer_snapshot = $3, risk_status = $4, risk_reasons = $5, status = $6, updated_at = now()
        where shop_id = $1 and id = $2
      `,
      [link.shop_id, link.order_draft_id, customer, risk.status, JSON.stringify(risk.reasons), risk.reasons.length ? "draft" : "ready"]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getCheckoutLinkDraft(token);
}

export async function confirmCheckoutLink(token: string) {
  const link = await activeCheckoutLink(token);
  const result = await confirmOrderDraft(link.shop_id, link.order_draft_id, "checkout-link");
  await db.query("update order_checkout_links set status = 'used', used_at = now() where id = $1 and status = 'active'", [link.id]);
  return result;
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

export async function listOrderIssues(shopId: string, input: { limit: number }) {
  const result = await db.query(
    `
      select *
      from (
        select o.id as order_id, 'failed_delivery' as issue_type, fd.reason as reason, fd.created_at, o.status, o.buyer_snapshot
        from failed_deliveries fd
        join orders o on o.id = fd.order_id and o.shop_id = fd.shop_id
        where fd.shop_id = $1 and fd.status = 'open'
        union all
        select o.id as order_id, 'courier_provider' as issue_type, sh.provider_error as reason, sh.updated_at as created_at, o.status, o.buyer_snapshot
        from shipments sh
        join orders o on o.id = sh.order_id and o.shop_id = sh.shop_id
        where sh.shop_id = $1 and sh.provider_status in ('not_connected', 'failed')
        union all
        select o.id as order_id, 'shipment_missing' as issue_type, 'Packed order has no open shipment' as reason, o.updated_at as created_at, o.status, o.buyer_snapshot
        from orders o
        where o.shop_id = $1 and o.status = 'packed' and not exists (
          select 1 from shipments sh where sh.shop_id = o.shop_id and sh.order_id = o.id and sh.status not in ('cancelled', 'returned')
        )
      ) issues
      order by created_at desc
      limit $2
    `,
    [shopId, input.limit]
  );
  return { issues: result.rows };
}

export async function bulkPreviewOrders(shopId: string, input: { action: BulkAction; orderIds: string[] }) {
  const rows = await bulkOrderRows(shopId, input.orderIds);
  const found = new Map(rows.map((row) => [row.id as string, row]));
  const items = input.orderIds.map((orderId) => previewOrder(orderId, found.get(orderId), input.action));
  return { action: input.action, total: items.length, ready: items.filter((item) => item.status === "ready").length, skipped: items.filter((item) => item.status === "skipped").length, items };
}

export async function bulkExportOrdersCsv(shopId: string, orderIds: string[]) {
  const preview = await bulkPreviewOrders(shopId, { action: "export", orderIds });
  const readyIds = preview.items.filter((item) => item.status === "ready").map((item) => item.orderId);
  if (!readyIds.length) return { csv: "id,status,total,currency,buyer_name,buyer_phone,created_at\n" };
  const result = await db.query(
    `
      select id, status, total, currency, buyer_snapshot, created_at
      from orders
      where shop_id = $1 and id = any($2::uuid[])
      order by created_at desc
    `,
    [shopId, readyIds]
  );
  return {
    csv: [
      "id,status,total,currency,buyer_name,buyer_phone,created_at",
      ...result.rows.map((row) => [row.id, row.status, row.total, row.currency, row.buyer_snapshot?.name ?? "", row.buyer_snapshot?.phone ?? "", row.created_at.toISOString()].map(csv).join(",")),
      ""
    ].join("\n")
  };
}

export async function bulkBookOrders(
  shopId: string,
  input: { orderIds: string[]; courierName: string; fee: number; note?: string },
  actorId: string
) {
  const preview = await bulkPreviewOrders(shopId, { action: "book", orderIds: input.orderIds });
  const items = [];
  for (const item of preview.items) {
    if (item.status === "skipped") {
      items.push(item);
      continue;
    }
    try {
      const booked = await createManualShipment(shopId, { orderId: item.orderId, courierName: input.courierName, fee: input.fee, note: input.note }, actorId);
      items.push({ ...item, shipmentId: booked.shipment.id });
    } catch (error) {
      items.push({ orderId: item.orderId, status: "skipped", reason: error instanceof DeliveryError || error instanceof OrderError ? error.code : "BOOKING_FAILED" });
    }
  }
  return { action: "book", total: items.length, booked: items.filter((item) => item.status === "ready" && "shipmentId" in item).length, skipped: items.filter((item) => item.status === "skipped").length, items };
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
      await lockInventoryVariants(client, shopId, items.rows.map((item) => item.variant_id));
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

async function extractDraftFields(shopId: string, message: string): Promise<{ customer: DraftCustomer; items: DraftItem[]; confidence: number }> {
  const phone = message.match(/(?:\+?8801|01)\d{9}\b/)?.[0];
  const name = message.match(/(?:name|ami|i am)\s*[:\-]?\s*([a-z][a-z .'-]{1,80}?)(?=\s+(?:phone|address|addr|thikana|want|order)\b|$)/i)?.[1]?.trim();
  const address = message.match(/(?:address|addr|thikana)\s*[:\-]?\s*([^\n]{8,300}?)(?=\s+(?:want|order|qty|quantity|\d+\s*(?:x|pcs?|pieces?))\b|$)/i)?.[1]?.trim();
  const products = await db.query(
    `
      select pv.id, p.name
      from product_variants pv
      join products p on p.id = pv.product_id
      where pv.shop_id = $1 and pv.status = 'active' and p.status = 'active'
      order by length(p.name) desc
      limit 100
    `,
    [shopId]
  );
  const lower = message.toLowerCase();
  const matched = products.rows.find((row) => lower.includes(String(row.name).toLowerCase()));
  const quantityMatch = message.match(/\b(?:qty|quantity)\s*[:\-]?\s*(\d{1,2})\b/i) ?? message.match(/\b(\d{1,2})\s*(?:x|pcs?|pieces?)\b/i);
  const quantity = Number(quantityMatch?.[1] ?? 1);
  const items = matched ? [{ variantId: matched.id as string, quantity: Math.max(1, quantity), confidence: 0.75 }] : [];
  const confidence = [phone, name, address, matched].filter(Boolean).length / 4;
  return { customer: { name, phone, address }, items, confidence };
}

async function activeCheckoutLink(token: string) {
  const link = await db.query(
    `
      select id, shop_id, order_draft_id, token, status, expires_at, used_at, created_at
      from order_checkout_links
      where token = $1
    `,
    [token]
  );
  if (!link.rowCount) throw new OrderError("Checkout link not found.", 404, "CHECKOUT_LINK_NOT_FOUND");
  const row = link.rows[0];
  if (row.status !== "active") throw new OrderError("Checkout link is no longer active.", 410, "CHECKOUT_LINK_INACTIVE");
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.query("update order_checkout_links set status = 'expired' where id = $1 and status = 'active'", [row.id]);
    throw new OrderError("Checkout link has expired.", 410, "CHECKOUT_LINK_EXPIRED");
  }
  return row;
}

function publicCheckoutLink(link: Record<string, unknown>) {
  return { status: link.status, expires_at: link.expires_at, created_at: link.created_at };
}

async function bulkOrderRows(shopId: string, orderIds: string[]) {
  if (!orderIds.length) return [];
  const result = await db.query(
    `
      select o.id, o.status, o.total, o.currency, o.buyer_snapshot, o.created_at,
        exists (
          select 1 from shipments sh where sh.shop_id = o.shop_id and sh.order_id = o.id and sh.status not in ('cancelled', 'returned')
        ) as has_open_shipment
      from orders o
      where o.shop_id = $1 and o.id = any($2::uuid[])
    `,
    [shopId, orderIds]
  );
  return result.rows;
}

function previewOrder(orderId: string, row: pg.QueryResultRow | undefined, action: BulkAction) {
  if (!row) return { orderId, status: "skipped" as const, reason: "ORDER_NOT_FOUND" };
  if (action === "book") {
    const buyer = row.buyer_snapshot as { phone?: string; address?: string };
    if (row.status !== "packed") return { orderId, status: "skipped" as const, reason: "ORDER_NOT_PACKED" };
    if (!buyer.phone || !buyer.address) return { orderId, status: "skipped" as const, reason: "SHIPMENT_ADDRESS_INCOMPLETE" };
    if (row.has_open_shipment) return { orderId, status: "skipped" as const, reason: "SHIPMENT_ALREADY_EXISTS" };
  }
  if (action === "print" && ["cancelled", "returned"].includes(row.status as string)) return { orderId, status: "skipped" as const, reason: "ORDER_CLOSED" };
  return { orderId, status: "ready" as const };
}

function csv(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeDraftAudit(client: pg.PoolClient, shopId: string, actorId: string, action: string, draftId: string, metadata: Record<string, unknown>) {
  await client.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, 'order_draft', $4, $5)",
    [shopId, actorId, action, draftId, metadata]
  );
}
