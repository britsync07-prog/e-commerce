import { config } from "../config.js";
import type { VectorStore } from "./vector-store.interface.js";
import { PostgresVectorStore } from "./postgres-vector.store.js";
import { ExternalVectorStore } from "./external-vector.store.js";

export * from "./vector-store.interface.js";
export * from "./postgres-vector.store.js";
export * from "./external-vector.store.js";

export const vectorStore: VectorStore =
  config.vectorStoreDriver === "external" && config.externalVectorEndpoint
    ? new ExternalVectorStore(config.externalVectorEndpoint)
    : new PostgresVectorStore();
