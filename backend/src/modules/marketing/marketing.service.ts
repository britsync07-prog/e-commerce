import { db } from "../../shared/db.js";

export class MarketingError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) { super(message); }
}

export async function listCoupons(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const filter = input.status ? "and status = $3" : "";
  if (input.status) values.push(input.status);
  const result = await db.query(`select id, shop_id, code, discount_type, discount_value, min_order_total, usage_limit, usage_count, expires_at, status, created_at, updated_at from coupons where shop_id = $1 ${filter} order by created_at desc limit $2`, values);
  return { coupons: result.rows };
}

export async function createCoupon(shopId: string, input: { code: string; discountType: "percent" | "fixed"; discountValue: number; minOrderTotal: number; usageLimit?: number | null; expiresAt?: string | null }, actorId: string) {
  try {
    const result = await db.query(
      `insert into coupons (shop_id, code, discount_type, discount_value, min_order_total, usage_limit, expires_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, shop_id, code, discount_type, discount_value, min_order_total, usage_limit, usage_count, expires_at, status, created_at`,
      [shopId, input.code, input.discountType, input.discountValue, input.minOrderTotal, input.usageLimit ?? null, input.expiresAt ?? null, actorId]
    );
    await audit(shopId, actorId, "coupon.created", "coupon", result.rows[0].id, { code: input.code });
    return { coupon: result.rows[0] };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new MarketingError("Coupon code already exists for this shop.", 409, "COUPON_CONFLICT");
    throw error;
  }
}

export async function updateCoupon(shopId: string, couponId: string, status: "active" | "disabled", actorId: string) {
  const result = await db.query("update coupons set status = $3, updated_at = now() where shop_id = $1 and id = $2 returning id, shop_id, code, status, updated_at", [shopId, couponId, status]);
  if (!result.rowCount) throw new MarketingError("Coupon not found.", 404, "COUPON_NOT_FOUND");
  await audit(shopId, actorId, "coupon.status_updated", "coupon", couponId, { status });
  return { coupon: result.rows[0] };
}

export async function listSegments(shopId: string) {
  const result = await db.query("select id, shop_id, name, definition, created_by, created_at, updated_at from customer_segments where shop_id = $1 order by created_at desc", [shopId]);
  return { segments: result.rows };
}

export async function createSegment(shopId: string, input: { name: string; definition: { consentStatus?: "unknown" | "opted_in"; tag?: string; minOrders: number; minLifetimeValue: number } }, actorId: string) {
  try {
    const result = await db.query("insert into customer_segments (shop_id, name, definition, created_by) values ($1, $2, $3, $4) returning id, shop_id, name, definition, created_by, created_at, updated_at", [shopId, input.name, JSON.stringify(input.definition), actorId]);
    await audit(shopId, actorId, "segment.created", "customer_segment", result.rows[0].id, { name: input.name });
    return { segment: result.rows[0] };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new MarketingError("Segment name already exists for this shop.", 409, "SEGMENT_CONFLICT");
    throw error;
  }
}

export async function previewSegment(shopId: string, segmentId: string) {
  const segment = await db.query("select id, name, definition from customer_segments where shop_id = $1 and id = $2", [shopId, segmentId]);
  if (!segment.rowCount) throw new MarketingError("Segment not found.", 404, "SEGMENT_NOT_FOUND");
  const definition = segment.rows[0].definition as { consentStatus?: string; tag?: string; minOrders?: number; minLifetimeValue?: number };
  const values: unknown[] = [shopId];
  const filters = ["c.shop_id = $1", "c.consent_status <> 'opted_out'"];
  if (definition.consentStatus) { values.push(definition.consentStatus); filters.push(`c.consent_status = $${values.length}`); }
  if (definition.tag) { values.push(definition.tag); filters.push(`exists (select 1 from customer_tag_links ctl join customer_tags ct on ct.id = ctl.tag_id and ct.shop_id = ctl.shop_id where ctl.shop_id = c.shop_id and ctl.customer_id = c.id and ct.name = $${values.length})`); }
  const result = await db.query(
    `select c.id, c.name, c.phone, c.consent_status, count(o.id)::int as order_count, coalesce(sum(o.total), 0)::numeric as lifetime_value
     from customers c left join orders o on o.shop_id = c.shop_id and o.customer_id = c.id
     where ${filters.join(" and ")} group by c.id having count(o.id) >= $${values.length + 1} and coalesce(sum(o.total), 0) >= $${values.length + 2}
     order by c.created_at desc limit 1000`,
    [...values, definition.minOrders ?? 0, definition.minLifetimeValue ?? 0]
  );
  return { segment: segment.rows[0], count: result.rowCount, customers: result.rows };
}

async function audit(shopId: string, actorId: string, action: string, targetType: string, targetId: string, metadata: unknown) {
  await db.query("insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, $3, $4, $5, $6)", [shopId, actorId, action, targetType, targetId, JSON.stringify(metadata)]);
}
