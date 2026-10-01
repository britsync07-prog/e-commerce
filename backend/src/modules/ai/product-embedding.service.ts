import { db } from "../../shared/db.js";
import { vectorStore } from "../../shared/vector-store/index.js";
import { downloadImageBuffer, embedImage } from "./gemini-embedding.service.js";

export async function embedAndIndexProductImage(
  shopId: string,
  productId: string,
  assetId: string | null,
  imageUrl: string
): Promise<void> {
  const { buffer, mimeType } = await downloadImageBuffer(imageUrl);
  const embedding = await embedImage(buffer, mimeType);

  await vectorStore.upsert({
    shopId,
    productId,
    assetId,
    imageUrl,
    embedding,
    dimensions: embedding.length,
    metadata: { indexedAt: new Date().toISOString() }
  });
}

export async function reindexShopCatalog(shopId: string): Promise<{ indexed: number; failed: number; total: number }> {
  const images = await db.query(
    `
      select pi.product_id, pi.asset_id, ao.public_url
      from product_images pi
      join products p on p.id = pi.product_id and p.status = 'active'
      join asset_objects ao on ao.id = pi.asset_id
      where pi.shop_id = $1 and ao.public_url is not null
    `,
    [shopId]
  );

  let indexed = 0;
  let failed = 0;

  for (const row of images.rows) {
    try {
      await embedAndIndexProductImage(shopId, row.product_id, row.asset_id, row.public_url);
      indexed++;
    } catch (err) {
      console.error(`Failed to index image for product ${row.product_id}:`, err);
      failed++;
    }
  }

  return { indexed, failed, total: images.rowCount ?? 0 };
}
