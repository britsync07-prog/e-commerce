export interface VectorMatch {
  productId: string;
  imageUrl: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface VectorRecord {
  id?: string;
  shopId: string;
  productId: string;
  assetId?: string | null;
  imageUrl: string;
  embedding: number[];
  dimensions?: number;
  metadata?: Record<string, unknown>;
}

export interface VectorStore {
  upsert(record: VectorRecord): Promise<void>;
  search(shopId: string, queryEmbedding: number[], limit?: number): Promise<VectorMatch[]>;
  deleteByProduct(shopId: string, productId: string): Promise<void>;
}
