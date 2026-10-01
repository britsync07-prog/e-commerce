import type { VectorMatch, VectorRecord, VectorStore } from "./vector-store.interface.js";
import { PostgresVectorStore } from "./postgres-vector.store.js";

export class ExternalVectorStore implements VectorStore {
  constructor(private readonly endpoint?: string) {}

  async upsert(record: VectorRecord): Promise<void> {
    if (!this.endpoint) {
      // Graceful fallback to local postgres if endpoint not configured
      const fallback = new PostgresVectorStore();
      return fallback.upsert(record);
    }
    const response = await fetch(`${this.endpoint}/vectors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record)
    });
    if (!response.ok) {
      throw new Error(`External vector store error: ${response.statusText}`);
    }
  }

  async search(shopId: string, queryEmbedding: number[], limit = 3): Promise<VectorMatch[]> {
    if (!this.endpoint) {
      const fallback = new PostgresVectorStore();
      return fallback.search(shopId, queryEmbedding, limit);
    }
    const response = await fetch(`${this.endpoint}/vectors/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, queryEmbedding, limit })
    });
    if (!response.ok) {
      throw new Error(`External vector search error: ${response.statusText}`);
    }
    return (await response.json()) as VectorMatch[];
  }

  async deleteByProduct(shopId: string, productId: string): Promise<void> {
    if (!this.endpoint) {
      const fallback = new PostgresVectorStore();
      return fallback.deleteByProduct(shopId, productId);
    }
    await fetch(`${this.endpoint}/vectors/${productId}?shopId=${encodeURIComponent(shopId)}`, {
      method: "DELETE"
    });
  }
}
