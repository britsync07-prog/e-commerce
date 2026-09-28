import type { PoolClient } from "pg";

export async function lockInventoryVariants(client: PoolClient, shopId: string, variantIds: string[]) {
  for (const variantId of [...new Set(variantIds)].sort()) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))", [shopId, variantId]);
  }
}
