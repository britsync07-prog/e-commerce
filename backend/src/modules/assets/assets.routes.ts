import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ZodError, z } from "zod";
import { config } from "../../shared/config.js";
import { AssetError, saveShopImage } from "./assets.service.js";

const paramsSchema = z.object({
  shopId: z.string().uuid()
});

export async function registerAssetRoutes(app: FastifyInstance) {
  app.post("/:shopId/images", async (request, reply) => {
    try {
      const params = paramsSchema.parse(request.params);
      const file = await request.file();
      if (!file) return reply.code(400).send({ code: "FILE_REQUIRED", message: "Multipart file is required." });
      return reply.code(201).send(await saveShopImage(params.shopId, file));
    } catch (error) {
      if (error instanceof AssetError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      if (error instanceof ZodError) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues });
      throw error;
    }
  });

  app.get("/file/assets/:shopId/:fileName", async (request, reply) => {
    const params = z.object({ shopId: z.string().uuid(), fileName: z.string().min(1) }).parse(request.params);
    const root = resolve(config.localStorageDir);
    const filePath = resolve(join(root, "assets", params.shopId, params.fileName));
    if (!filePath.startsWith(root)) return reply.code(400).send({ code: "INVALID_PATH", message: "Invalid file path." });

    try {
      await stat(filePath);
      return reply.header("Cache-Control", "public, max-age=31536000, immutable").send(createReadStream(filePath));
    } catch {
      return reply.code(404).send({ code: "ASSET_NOT_FOUND", message: "Asset not found." });
    }
  });
}

