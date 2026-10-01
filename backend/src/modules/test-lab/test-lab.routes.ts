import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  addTestProduct,
  chatSimulate,
  ensureTestShop,
  listTestProducts,
  saveBatchProducts,
  seed10DemoProducts,
  verifyKeys
} from "./test-lab.service.js";

const verifyKeysSchema = z.object({
  geminiKey: z.string().trim().optional(),
  groqKey: z.string().trim().optional()
});

const addProductSchema = z.object({
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1000).optional(),
  price: z.coerce.number().min(1),
  stock: z.coerce.number().int().min(1).default(10),
  imageUrl: z.string().trim().min(5),
  sizes: z.array(z.string().trim()).optional(),
  geminiKey: z.string().trim().optional()
});

const seedDemoSchema = z.object({
  geminiKey: z.string().trim().optional()
});

const batchProductItemSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(1000).optional(),
  price: z.coerce.number().min(1),
  stock: z.coerce.number().int().min(0).default(10),
  imageUrl: z.string().trim().optional(),
  imageBase64: z.string().trim().optional(),
  sizes: z.array(z.string().trim()).optional()
});

const batchProductsSchema = z.object({
  products: z.array(batchProductItemSchema).min(1).max(10),
  geminiKey: z.string().trim().optional()
});

const chatSimulateSchema = z.object({
  text: z.string().trim().max(1000).optional(),
  imageUrl: z.string().trim().url().optional(),
  imageBase64: z.string().trim().optional(),
  mimeType: z.string().trim().optional(),
  geminiKey: z.string().trim().optional(),
  groqKey: z.string().trim().optional(),
  aiBrain: z
    .object({
      shopName: z.string().trim().optional(),
      tone: z.string().trim().optional(),
      systemPrompt: z.string().trim().optional(),
      confidenceThreshold: z.coerce.number().optional()
    })
    .optional()
});

export async function registerTestLabRoutes(app: FastifyInstance) {
  // Serve the HTML test workbench UI directly
  app.get("/ui", async (_req, reply) => {
    const candidatePaths = [
      join(process.cwd(), "src", "modules", "test-lab", "ui", "test-bench.html"),
      join(process.cwd(), "backend", "src", "modules", "test-lab", "ui", "test-bench.html"),
      fileURLToPath(new URL("ui/test-bench.html", import.meta.url))
    ];
    const resolvedPath = candidatePaths.find((p) => existsSync(p));
    if (!resolvedPath) {
      return reply.code(404).send("test-bench.html UI template not found on disk");
    }
    const html = readFileSync(resolvedPath, "utf-8");
    return reply
      .header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0")
      .header("Pragma", "no-cache")
      .header("Expires", "0")
      .type("text/html; charset=utf-8")
      .send(html);
  });

  app.get("/status", async () => {
    const shop = await ensureTestShop();
    const { products } = await listTestProducts();
    return {
      status: "ready",
      testShop: { id: shop.id, name: shop.display_name, currency: shop.currency },
      totalProducts: products.length,
      embeddedCount: products.filter((p: { is_embedded?: boolean }) => p.is_embedded).length
    };
  });

  app.post("/verify-keys", async (request, reply) => {
    try {
      const body = verifyKeysSchema.parse(request.body ?? {});
      return reply.send(await verifyKeys(body.geminiKey, body.groqKey));
    } catch (err) {
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        message: err instanceof Error ? err.message : "Invalid key payload"
      });
    }
  });

  app.get("/products", async () => {
    return listTestProducts();
  });

  app.post("/products", async (request, reply) => {
    try {
      const body = addProductSchema.parse(request.body);
      const res = await addTestProduct(body, body.geminiKey);
      return reply.code(201).send(res);
    } catch (err) {
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        message: err instanceof Error ? err.message : "Invalid product payload"
      });
    }
  });

  app.post("/seed-demo", async (request, reply) => {
    try {
      const body = seedDemoSchema.parse(request.body ?? {});
      const res = await seed10DemoProducts(body.geminiKey);
      return reply.code(201).send(res);
    } catch (err) {
      return reply.code(500).send({
        code: "SEED_FAILED",
        message: err instanceof Error ? err.message : "Failed to seed demo products"
      });
    }
  });

  app.post("/batch-products", async (request, reply) => {
    try {
      const body = batchProductsSchema.parse(request.body);
      const res = await saveBatchProducts(body.products, body.geminiKey);
      return reply.code(201).send(res);
    } catch (err) {
      return reply.code(400).send({
        code: "BATCH_UPLOAD_FAILED",
        message: err instanceof Error ? err.message : "Failed to save batch products"
      });
    }
  });

  app.post("/chat", async (request, reply) => {
    try {
      const body = chatSimulateSchema.parse(request.body ?? {});
      const res = await chatSimulate(
        {
          text: body.text,
          imageUrl: body.imageUrl,
          imageBase64: body.imageBase64,
          mimeType: body.mimeType,
          aiBrain: body.aiBrain
        },
        body.geminiKey,
        body.groqKey
      );
      return reply.send(res);
    } catch (err) {
      return reply.code(400).send({
        code: "CHAT_SIMULATION_FAILED",
        message: err instanceof Error ? err.message : "Chat simulation failed"
      });
    }
  });
}
