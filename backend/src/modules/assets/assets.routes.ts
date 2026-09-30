import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ZodError, z } from "zod";
import { config } from "../../shared/config.js";
import { db } from "../../shared/db.js";
import { PermissionError, requireShopPermission } from "../../shared/permissions.js";
import { AuthError } from "../auth/auth.service.js";
import { AssetError, attachProductImage, createSignedAssetUrl, removeProductImage, savePaymentProof, saveShopImage } from "./assets.service.js";
import { localPrivateStream, verifyLocalPrivateUrl } from "./storage.js";

const paramsSchema = z.object({
  shopId: z.string().uuid()
});
const productImageParamsSchema = paramsSchema.extend({ productId: z.string().uuid() });
const imageParamsSchema = productImageParamsSchema.extend({ imageId: z.string().uuid() });
const assetParamsSchema = paramsSchema.extend({ assetId: z.string().uuid() });
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

  app.post("/:shopId/proofs", async (request, reply) => {
    try {
      const params = paramsSchema.parse(request.params);
      const session = await requireShopPermission(request, params.shopId, "assets:write");
      const file = await request.file();
      if (!file) return reply.code(400).send({ code: "FILE_REQUIRED", message: "Multipart file is required." });
      return reply.code(201).send(await savePaymentProof(params.shopId, file, session.user.id as string));
    } catch (error) {
      if (error instanceof AssetError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      if (error instanceof PermissionError || error instanceof AuthError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
      if (error instanceof ZodError) return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Request validation failed.", issues: error.issues });
      throw error;
    }
  });

  app.get("/:shopId/files/:assetId/signed-url", async (request, reply) => {
    try {
      const params = assetParamsSchema.parse(request.params);
      await requireShopPermission(request, params.shopId, "assets:write");
      return createSignedAssetUrl(params.shopId, params.assetId);
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

  app.get("/file/:access/:shopId/:fileName", async (request, reply) => {
    const params = z.object({ access: z.literal("public"), shopId: z.string().uuid(), fileName: z.string().min(1) }).parse(request.params);
    return sendLocalPublicFile(reply, params.access, params.shopId, params.fileName);
  });

  app.get("/file/assets/:shopId/:fileName", async (request, reply) => {
    const params = z.object({ shopId: z.string().uuid(), fileName: z.string().min(1) }).parse(request.params);
    return sendLocalPublicFile(reply, "assets", params.shopId, params.fileName);
  });

  app.get("/private/:assetId", async (request, reply) => {
    const params = z.object({ assetId: z.string().uuid() }).parse(request.params);
    const query = z.object({ expires: z.string(), token: z.string() }).parse(request.query);
    if (!verifyLocalPrivateUrl(params.assetId, query.expires, query.token)) return reply.code(403).send({ code: "SIGNED_URL_INVALID", message: "Signed URL is invalid or expired." });
    const row = await db.query("select object_key, mime_type from asset_objects where id = $1 and storage_driver = 'local' and public_url = ''", [params.assetId]);
    const asset = row.rows[0];
    if (!asset) return reply.code(404).send({ code: "ASSET_NOT_FOUND", message: "Asset not found." });
    const stream = await localPrivateStream(asset.object_key);
    if (!stream) return reply.code(404).send({ code: "ASSET_NOT_FOUND", message: "Asset not found." });
    return reply.header("Content-Type", asset.mime_type).header("Cache-Control", "private, max-age=300").send(stream);
  });
}

async function sendLocalPublicFile(reply: FastifyReply, prefix: string, shopId: string, fileName: string) {
  const root = resolve(config.localStorageDir);
  const filePath = resolve(join(root, prefix, shopId, fileName));
  if (!filePath.startsWith(root)) return reply.code(400).send({ code: "INVALID_PATH", message: "Invalid file path." });

  try {
    await stat(filePath);
    return reply.header("Cache-Control", "public, max-age=31536000, immutable").send(createReadStream(filePath));
  } catch {
    return reply.code(404).send({ code: "ASSET_NOT_FOUND", message: "Asset not found." });
  }
}
