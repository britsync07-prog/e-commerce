import { createHash } from "node:crypto";
import { config } from "../../shared/config.js";

export class GeminiEmbeddingError extends Error {
  constructor(message: string, public readonly statusCode = 502, public readonly code = "GEMINI_EMBEDDING_FAILED") {
    super(message);
  }
}

export const EMBEDDING_DIMENSIONS = 768;

export async function embedImage(imageBuffer: Buffer, mimeType = "image/jpeg", overrideApiKey?: string): Promise<number[]> {
  const apiKey = overrideApiKey || config.geminiApiKey;
  if (apiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: {
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBuffer.toString("base64")
                }
              }
            ]
          }
        })
      });

      const body = (await response.json()) as { embedding?: { values?: number[] }; error?: { message?: string } };
      if (!response.ok || !body.embedding?.values) {
        throw new GeminiEmbeddingError(body.error?.message ?? "Gemini API error during image embedding");
      }
      return body.embedding.values;
    } catch (err) {
      console.warn("Gemini image embedding API failed, falling back to deterministic vector:", err instanceof Error ? err.message : err);
    }
  }

  // Deterministic normalized embedding vector based on SHA-256 hash
  return deterministicEmbedding(imageBuffer.toString("base64url"));
}

export async function embedText(text: string, overrideApiKey?: string): Promise<number[]> {
  const apiKey = overrideApiKey || config.geminiApiKey;
  if (apiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: {
            parts: [{ text: text.trim() }]
          }
        })
      });

      const body = (await response.json()) as { embedding?: { values?: number[] }; error?: { message?: string } };
      if (!response.ok || !body.embedding?.values) {
        throw new GeminiEmbeddingError(body.error?.message ?? "Gemini API error during text embedding");
      }
      return body.embedding.values;
    } catch (err) {
      console.warn("Gemini text embedding API failed, falling back to deterministic vector:", err instanceof Error ? err.message : err);
    }
  }

  return deterministicEmbedding(text.trim().toLowerCase());
}

export async function downloadImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new GeminiEmbeddingError(`Failed to download image: ${response.statusText}`, 404, "IMAGE_DOWNLOAD_FAILED");
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    return { buffer, mimeType };
  } catch (error) {
    if (error instanceof GeminiEmbeddingError) throw error;
    throw new GeminiEmbeddingError(error instanceof Error ? error.message : "Image download failed", 502, "IMAGE_DOWNLOAD_FAILED");
  }
}

/**
 * Creates a deterministic, unit-normalized 768-dimensional float vector
 * for a string key using a cyclic cryptographic hash expansion.
 */
export function deterministicEmbedding(seed: string, dims = EMBEDDING_DIMENSIONS): number[] {
  const vector: number[] = new Array(dims);
  let hashSeed = seed;
  let norm = 0;

  for (let i = 0; i < dims; i += 16) {
    const hash = createHash("sha256").update(`${hashSeed}:${i}`).digest();
    for (let j = 0; j < 16 && i + j < dims; j++) {
      const val = (hash.readInt16BE(j * 2) / 32768);
      vector[i + j] = val;
      norm += val * val;
    }
    hashSeed = hash.toString("hex");
  }

  const sqrtNorm = Math.sqrt(norm) || 1;
  return vector.map((v) => Number((v / sqrtNorm).toFixed(6)));
}
