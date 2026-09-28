import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ZodError, z } from "zod";
import { config } from "../../shared/config.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { AuthError } from "../auth/auth.service.js";
import { AssetError, attachProductImage, removeProductImage, saveShopImage } from "./assets.service.js";

const paramsSchema = z.object({
  shopId: z.string().uuid()
});
const productImageParamsSchema = paramsSchema.extend({ productId: z.string().uuid() });
const imageParamsSchema = productImageParamsSchema.extend({ imageId: z.string().uuid() });
const attachImageSchema = z.object({ assetId: z.string().uuid(), altText: z.string().trim().max(240).optional(), sortOrder: z.coerce.number().int().min(0).max(1000).optional() });

export async function registerAssetRoutes(app: FastifyInstance) {
  app.post("/:shopId/images", async (request, reply) => {
    try {
      const params = paramsSchema.parse(request.params);
      const session = await requireShopPermission(request, params.shopId, "assets:write");
      const file = await request.file();
      if (!file) return reply.code(400).send({ code: "FILE_REQUIRED", message: "Multipart file is required." });
      return reply.code(201).send(await saveShopImage(params.shopId, file, session.user.id as string));
    } catch (error) {
      if (error instanceof AssetError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      if (error instanceof PermissionError || error instanceof AuthError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      if (error instanceof ZodError) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues });
      throw error;
    }
  });

  app.post("/:shopId/products/:productId/images", async (request, reply) => {
    try {
      const params = productImageParamsSchema.parse(request.params);
      const body = attachImageSchema.parse(request.body);
      const session = await requireShopPermission(request, params.shopId, "assets:write");
      return reply.code(201).send(await attachProductImage(params.shopId, params.productId, body, session.user.id as string));
    } catch (error) {
      if (error instanceof AssetError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      if (error instanceof PermissionError || error instanceof AuthError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      if (error instanceof ZodError) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues });
      throw error;
    }
  });

  app.delete("/:shopId/products/:productId/images/:imageId", async (request, reply) => {
    try {
      const params = imageParamsSchema.parse(request.params);
      const session = await requireShopPermission(request, params.shopId, "assets:write");
      return removeProductImage(params.shopId, params.productId, params.imageId, session.user.id as string);
    } catch (error) {
      if (error instanceof AssetError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      if (error instanceof PermissionError || error instanceof AuthError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
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
