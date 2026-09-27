import { db } from "../../shared/db.js";

export class InventoryError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

export async function getStock(shopId: string, variantId: string) {
  await ensureVariant(shopId, variantId);
  const result = await db.query(
    "select coalesce(sum(delta_quantity), 0)::int as quantity from inventory_ledger where shop_id = $1 and variant_id = $2",
    [shopId, variantId]
  );
  return { shopId, variantId, quantity: Number(result.rows[0].quantity) };
}

export async function adjustStock(shopId: string, variantId: string, input: { deltaQuantity: number; reason: string; note?: string }) {
  const client = await db.connect();
  try {
    await client.query("begin");
    await ensureVariant(shopId, variantId);
    const current = await client.query("select coalesce(sum(delta_quantity), 0)::int as quantity from inventory_ledger where shop_id = $1 and variant_id = $2", [
      shopId,
      variantId
    ]);
    const quantityAfter = Number(current.rows[0].quantity) + input.deltaQuantity;
    if (quantityAfter < 0) throw new InventoryError("Inventory cannot go below zero.", 409, "INSUFFICIENT_STOCK");

    const ledger = await client.query(
      `
        insert into inventory_ledger (shop_id, variant_id, reason, delta_quantity, quantity_after, created_by)
        values ($1, $2, $3, $4, $5, $6)
        returning id, shop_id, variant_id, reason, delta_quantity, quantity_after, created_at
      `,
      [shopId, variantId, input.reason, input.deltaQuantity, quantityAfter, "inventory-api"]
    );

    await client.query(
      `
        insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata)
        values ($1, 'system', 'inventory-api', 'inventory.adjusted', 'variant', $2, $3)
      `,
      [shopId, variantId, { note: input.note, deltaQuantity: input.deltaQuantity, quantityAfter }]
    );

    await client.query("commit");
    return { stock: { shopId, variantId, quantity: quantityAfter }, ledger: ledger.rows[0] };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureVariant(shopId: string, variantId: string) {
  const variant = await db.query("select id from product_variants where shop_id = $1 and id = $2", [shopId, variantId]);
  if (!variant.rowCount) throw new InventoryError("Variant not found.", 404, "VARIANT_NOT_FOUND");
}

