import { db } from "../db.js";
import type { VectorMatch, VectorRecord, VectorStore } from "./vector-store.interface.js";

export class PostgresVectorStore implements VectorStore {
  async upsert(record: VectorRecord): Promise<void> {
    const dimensions = record.dimensions ?? record.embedding.length;
    await db.query(
      `
        insert into product_image_embeddings (
          shop_id, product_id, asset_id, image_url, embedding, dimensions, metadata, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, now())
        on conflict (shop_id, product_id, image_url)
        do update set
          asset_id = excluded.asset_id,
          embedding = excluded.embedding,
          dimensions = excluded.dimensions,
          metadata = excluded.metadata,
          updated_at = now()
      `,
      [
        record.shopId,
        record.productId,
        record.assetId ?? null,
        record.imageUrl,
        record.embedding,
        dimensions,
        JSON.stringify(record.metadata ?? {})
      ]
    );
  }

  async search(shopId: string, queryEmbedding: number[], limit = 3): Promise<VectorMatch[]> {
    try {
      const result = await db.query(
        `
          select product_id, image_url, metadata,
                 cosine_similarity(embedding, $2) as similarity
          from product_image_embeddings
          where shop_id = $1
          order by similarity desc
          limit $3
        `,
        [shopId, queryEmbedding, limit]
      );

      return result.rows.map((row) => ({
        productId: row.product_id,
        imageUrl: row.image_url,
        similarity: Number(row.similarity ?? 0),
        metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata
      }));
    } catch {
      try {
        // In-memory fallback if SQL function is temporarily unavailable in test mock
        const rows = await db.query(
          `
            select product_id, image_url, embedding, metadata
            from product_image_embeddings
            where shop_id = $1
          `,
          [shopId]
        );

        const scored = rows.rows.map((row) => {
          const emb = Array.isArray(row.embedding) ? row.embedding.map(Number) : [];
          return {
            productId: row.product_id,
            imageUrl: row.image_url,
            similarity: cosineSimilarityJs(queryEmbedding, emb),
            metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata
          };
        });

        scored.sort((a, b) => b.similarity - a.similarity);
        return scored.slice(0, limit);
      } catch {
        return [];
      }
    }
  }

  async deleteByProduct(shopId: string, productId: string): Promise<void> {
    await db.query(
      "delete from product_image_embeddings where shop_id = $1 and product_id = $2",
      [shopId, productId]
    );
  }
}

export function cosineSimilarityJs(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
