import { db } from "../../shared/db.js";

export class CustomerError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) { super(message); }
}

export async function listCustomers(shopId: string, input: { search?: string; consentStatus?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const filters = ["c.shop_id = $1", "c.status = 'active'"];
  if (input.search) { values.push(`%${input.search}%`); filters.push(`(c.name ilike $${values.length} or c.phone ilike $${values.length})`); }
  if (input.consentStatus) { values.push(input.consentStatus); filters.push(`c.consent_status = $${values.length}`); }
  const result = await db.query(
    `select c.id, c.shop_id, c.name, c.phone, c.language, c.consent_status, c.consent_updated_at, c.created_at, c.updated_at,
      count(distinct o.id)::int as order_count, coalesce(sum(o.total), 0)::numeric as lifetime_value,
      max(o.created_at) as last_order_at,
      count(distinct ctl.tag_id)::int as tag_count
     from customers c
     left join orders o on o.shop_id = c.shop_id and o.customer_id = c.id
     left join customer_tag_links ctl on ctl.shop_id = c.shop_id and ctl.customer_id = c.id
     where ${filters.join(" and ")}
     group by c.id order by coalesce(max(o.created_at), c.created_at) desc limit $2`,
    values
  );
  return { customers: result.rows };
}

export async function getCustomer(shopId: string, customerId: string) {
  const customer = await db.query("select id, shop_id, name, phone, language, consent_status, consent_updated_at, status, merged_into_customer_id, created_at, updated_at from customers where shop_id = $1 and id = $2", [shopId, customerId]);
  if (!customer.rowCount) throw new CustomerError("Customer not found.", 404, "CUSTOMER_NOT_FOUND");
  const [addresses, tags, orders, payments, messages, shipments] = await Promise.all([
    db.query("select id, address, city, area, created_at from customer_addresses where shop_id = $1 and customer_id = $2 order by created_at desc", [shopId, customerId]),
    db.query("select ct.id, ct.name, ctl.created_at from customer_tag_links ctl join customer_tags ct on ct.id = ctl.tag_id and ct.shop_id = ctl.shop_id where ctl.shop_id = $1 and ctl.customer_id = $2 order by ct.name", [shopId, customerId]),
    db.query("select id, status, total, currency, source, created_at from orders where shop_id = $1 and customer_id = $2 order by created_at desc limit 100", [shopId, customerId]),
    db.query("select pr.id, pr.order_id, pr.status, pr.amount, pr.currency, pr.created_at from payment_records pr join orders o on o.id = pr.order_id and o.shop_id = pr.shop_id where pr.shop_id = $1 and o.customer_id = $2 order by pr.created_at desc limit 100", [shopId, customerId]),
    db.query("select m.id, m.conversation_id, m.source, m.body, m.created_at from conversation_messages m join conversations c on c.id = m.conversation_id and c.shop_id = m.shop_id where m.shop_id = $1 and c.buyer_phone = (select phone from customers where shop_id = $1 and id = $2) order by m.created_at desc limit 100", [shopId, customerId]),
    db.query("select sh.id, sh.order_id, sh.status, sh.courier_name, sh.tracking_number, sh.created_at from shipments sh join orders o on o.id = sh.order_id and o.shop_id = sh.shop_id where sh.shop_id = $1 and o.customer_id = $2 order by sh.created_at desc limit 100", [shopId, customerId])
  ]);
  const timeline = [
    ...orders.rows.map((row) => ({ type: "order", id: row.id, status: row.status, amount: row.total, currency: row.currency, created_at: row.created_at })),
    ...payments.rows.map((row) => ({ type: "payment", id: row.id, status: row.status, amount: row.amount, currency: row.currency, order_id: row.order_id, created_at: row.created_at })),
    ...messages.rows.map((row) => ({ type: "message", id: row.id, status: row.source, body: row.body, conversation_id: row.conversation_id, created_at: row.created_at })),
    ...shipments.rows.map((row) => ({ type: "shipment", id: row.id, status: row.status, courier_name: row.courier_name, tracking_number: row.tracking_number, order_id: row.order_id, created_at: row.created_at }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { customer: customer.rows[0], addresses: addresses.rows, tags: tags.rows, timeline };
}

export async function updateConsent(shopId: string, customerId: string, input: { status: "unknown" | "opted_in" | "opted_out"; reason: string }, actorId: string) {
  const result = await db.query("update customers set consent_status = $3, consent_updated_at = now(), updated_at = now() where shop_id = $1 and id = $2 returning id", [shopId, customerId, input.status]);
  if (!result.rowCount) throw new CustomerError("Customer not found.", 404, "CUSTOMER_NOT_FOUND");
  await writeAudit(shopId, actorId, "customer.consent_updated", "customer", customerId, { status: input.status, reason: input.reason });
  return getCustomer(shopId, customerId);
}

export async function addTag(shopId: string, customerId: string, name: string, actorId: string) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const customer = await client.query("select id from customers where shop_id = $1 and id = $2 and status = 'active'", [shopId, customerId]);
    if (!customer.rowCount) throw new CustomerError("Customer not found.", 404, "CUSTOMER_NOT_FOUND");
    const tag = await client.query("insert into customer_tags (shop_id, name) values ($1, $2) on conflict (shop_id, name) do update set name = excluded.name returning id", [shopId, name]);
    await client.query("insert into customer_tag_links (shop_id, customer_id, tag_id) values ($1, $2, $3) on conflict do nothing", [shopId, customerId, tag.rows[0].id]);
    await client.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'customer.tag_added', 'customer', $3, $4)", [shopId, actorId, customerId, JSON.stringify({ name })]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return getCustomer(shopId, customerId);
}

export async function previewMerge(shopId: string, sourceCustomerId: string, targetCustomerId: string) {
  if (sourceCustomerId === targetCustomerId) throw new CustomerError("Source and target customers must be different.", 400, "MERGE_SAME_CUSTOMER");
  const customers = await db.query("select id, name, phone, consent_status, status, merged_into_customer_id from customers where shop_id = $1 and id = any($2::uuid[]) order by id", [shopId, [sourceCustomerId, targetCustomerId]]);
  if (customers.rowCount !== 2) throw new CustomerError("Both customers must belong to this shop.", 404, "CUSTOMER_NOT_FOUND");
  const source = customers.rows.find((row) => row.id === sourceCustomerId);
  const target = customers.rows.find((row) => row.id === targetCustomerId);
  if (source.status !== "active" || target.status !== "active") throw new CustomerError("Only active customers can be merged.", 409, "CUSTOMER_NOT_ACTIVE");
  const [orders, addresses, tags] = await Promise.all([
    db.query("select customer_id, count(*)::int as count, coalesce(sum(total), 0)::numeric as value from orders where shop_id = $1 and customer_id = any($2::uuid[]) group by customer_id", [shopId, [sourceCustomerId, targetCustomerId]]),
    db.query("select customer_id, count(*)::int as count from customer_addresses where shop_id = $1 and customer_id = any($2::uuid[]) group by customer_id", [shopId, [sourceCustomerId, targetCustomerId]]),
    db.query("select ct.name, ctl.customer_id from customer_tag_links ctl join customer_tags ct on ct.id = ctl.tag_id and ct.shop_id = ctl.shop_id where ctl.shop_id = $1 and ctl.customer_id = any($2::uuid[]) order by ct.name", [shopId, [sourceCustomerId, targetCustomerId]])
  ]);
  return { source, target, impact: { orders: orders.rows, addresses: addresses.rows, tags: tags.rows }, warnings: source.consent_status === "opted_out" && target.consent_status !== "opted_out" ? ["Target will inherit opted_out consent."] : [] };
}

export async function mergeCustomers(shopId: string, sourceCustomerId: string, targetCustomerId: string, reason: string, actorId: string) {
  if (sourceCustomerId === targetCustomerId) throw new CustomerError("Source and target customers must be different.", 400, "MERGE_SAME_CUSTOMER");
  const client = await db.connect();
  try {
    await client.query("begin");
    const customers = await client.query("select id, consent_status, status from customers where shop_id = $1 and id = any($2::uuid[]) order by id for update", [shopId, [sourceCustomerId, targetCustomerId]]);
    if (customers.rowCount !== 2) throw new CustomerError("Both customers must belong to this shop.", 404, "CUSTOMER_NOT_FOUND");
    const source = customers.rows.find((row) => row.id === sourceCustomerId);
    const target = customers.rows.find((row) => row.id === targetCustomerId);
    if (source.status !== "active" || target.status !== "active") throw new CustomerError("Only active customers can be merged.", 409, "CUSTOMER_NOT_ACTIVE");
    await client.query("update orders set customer_id = $3, updated_at = now() where shop_id = $1 and customer_id = $2", [shopId, sourceCustomerId, targetCustomerId]);
    await client.query("update customer_addresses set customer_id = $3 where shop_id = $1 and customer_id = $2", [shopId, sourceCustomerId, targetCustomerId]);
    await client.query("insert into customer_tag_links (shop_id, customer_id, tag_id) select shop_id, $3, tag_id from customer_tag_links where shop_id = $1 and customer_id = $2 on conflict do nothing", [shopId, sourceCustomerId, targetCustomerId]);
    await client.query("delete from customer_tag_links where shop_id = $1 and customer_id = $2", [shopId, sourceCustomerId]);
    if (source.consent_status === "opted_out") await client.query("update customers set consent_status = 'opted_out', consent_updated_at = now() where shop_id = $1 and id = $2", [shopId, targetCustomerId]);
    await client.query("update customers set status = 'merged', merged_into_customer_id = $3, updated_at = now() where shop_id = $1 and id = $2", [shopId, sourceCustomerId, targetCustomerId]);
    await client.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'customer.merge_completed', 'customer', $3, $4)", [shopId, actorId, targetCustomerId, JSON.stringify({ sourceCustomerId, targetCustomerId, reason })]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return getCustomer(shopId, targetCustomerId);
}

async function writeAudit(shopId: string, actorId: string, action: string, targetType: string, targetId: string, metadata: unknown) {
  await db.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, $4, $5, $6)", [shopId, actorId, action, targetType, targetId, JSON.stringify(metadata)]);
}
