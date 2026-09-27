import { db } from "../../shared/db.js";

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

