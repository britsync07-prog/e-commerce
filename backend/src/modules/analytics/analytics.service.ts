import { db } from "../../shared/db.js";

export async function getDashboardMetrics(shopId: string, input: { from: string; to: string }) {
  const range = [shopId, input.from, input.to];
  const [orders, shipments, failures, conversations, messages, drafts] = await Promise.all([
    db.query(
      `select status, count(*)::int as count, coalesce(sum(total), 0)::numeric as revenue
       from orders where shop_id = $1 and created_at >= $2::date and created_at < ($3::date + interval '1 day')
       group by status`, range
    ),
    db.query(
      `select status, count(*)::int as count from shipments
       where shop_id = $1 and created_at >= $2::date and created_at < ($3::date + interval '1 day') group by status`, range
    ),
    db.query(
      `select count(*)::int as total, count(*) filter (where status = 'open')::int as open,
        count(*) filter (where status = 'rescheduled')::int as rescheduled,
        count(*) filter (where status = 'returned')::int as returned
       from failed_deliveries where shop_id = $1 and created_at >= $2::date and created_at < ($3::date + interval '1 day')`, range
    ),
    db.query("select count(*)::int as count from conversations where shop_id = $1 and created_at >= $2::date and created_at < ($3::date + interval '1 day')", range),
    db.query("select count(*)::int as total, count(*) filter (where source = 'ai')::int as ai from conversation_messages where shop_id = $1 and created_at >= $2::date and created_at < ($3::date + interval '1 day')", range),
    db.query(
      `select count(*)::int as total,
        count(*) filter (where status = 'suggested')::int as suggested,
        count(*) filter (where status = 'approved')::int as approved,
        count(*) filter (where status = 'rejected')::int as rejected,
        count(*) filter (where status = 'needs_review')::int as needs_review
       from ai_reply_drafts where shop_id = $1 and created_at >= $2::date and created_at < ($3::date + interval '1 day')`, range
    )
  ]);

  const orderMetrics = byStatus(orders.rows);
  const shipmentMetrics = byStatus(shipments.rows);
  return {
    period: { from: input.from, to: input.to },
    sales: {
      grossRevenue: sumRevenue(orders.rows, ["new", "confirmed", "packed", "shipped", "delivered"]),
      deliveredRevenue: sumRevenue(orders.rows, ["delivered"]),
      orderCount: sumCount(orders.rows, ["new", "confirmed", "packed", "shipped", "delivered"])
    },
    orders: {
      placed: orderMetrics.new ?? 0,
      confirmed: orderMetrics.confirmed ?? 0,
      packed: orderMetrics.packed ?? 0,
      shipped: orderMetrics.shipped ?? 0,
      delivered: orderMetrics.delivered ?? 0,
      cancelled: orderMetrics.cancelled ?? 0,
      returned: orderMetrics.returned ?? 0
    },
    delivery: {
      booked: shipmentMetrics.booked ?? 0,
      pickedUp: shipmentMetrics.picked_up ?? 0,
      inTransit: shipmentMetrics.in_transit ?? 0,
      delivered: shipmentMetrics.delivered ?? 0,
      failed: shipmentMetrics.failed ?? 0,
      returned: shipmentMetrics.returned ?? 0,
      failedDeliveries: failures.rows[0]
    },
    ai: {
      conversations: conversations.rows[0].count,
      messages: messages.rows[0].total,
      aiMessages: messages.rows[0].ai,
      drafts: drafts.rows[0]
    }
  };
}

export async function getOrderReport(shopId: string, input: { from: string; to: string; status?: string; format: "json" | "csv"; limit: number }) {
  const values: unknown[] = [shopId, input.from, input.to];
  const statusFilter = input.status ? ` and status = $${values.push(input.status)}` : "";
  const result = await db.query(`select id, status, source, total, currency, attribution_source, attribution_campaign_id, created_at from orders where shop_id = $1 and created_at >= $2::date and created_at < ($3::date + interval '1 day')${statusFilter} order by created_at desc limit ${input.limit}`, values);
  const totals = { count: result.rowCount ?? 0, revenue: result.rows.reduce((sum, row) => sum + Number(row.total), 0) };
  if (input.format === "csv") return { csv: ["id,status,source,total,currency,attribution_source,attribution_campaign_id,created_at", ...result.rows.map((row) => [row.id, row.status, row.source, row.total, row.currency, row.attribution_source, row.attribution_campaign_id ?? "", row.created_at.toISOString()].map(csv).join(",")), ""].join("\n"), totals, filters: input };
  return { filters: input, totals, orders: result.rows };
}

export async function listAnalyticsEvents(shopId: string, input: { from: string; to: string; eventType?: string; limit: number }) {
  const values: unknown[] = [shopId, input.from, input.to];
  const typeFilter = input.eventType ? ` and event_type = $${values.push(input.eventType)}` : "";
  const result = await db.query(`select id, event_type, entity_type, entity_id, source, payload, occurred_at from analytics_events where shop_id = $1 and occurred_at >= $2::date and occurred_at < ($3::date + interval '1 day')${typeFilter} order by occurred_at desc limit ${input.limit}`, values);
  return { filters: input, events: result.rows };
}

function csv(value: unknown) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }

function byStatus(rows: { status: string; count: number }[]) {
  return Object.fromEntries(rows.map((row) => [row.status, Number(row.count)])) as Record<string, number>;
}

function sumCount(rows: { status: string; count: number }[], statuses: string[]) {
  return rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + Number(row.count), 0);
}

function sumRevenue(rows: { status: string; revenue: string | number }[], statuses: string[]) {
  return rows.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + Number(row.revenue), 0);
}
