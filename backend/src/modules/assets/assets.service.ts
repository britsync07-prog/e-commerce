import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { MultipartFile } from "@fastify/multipart";
import { db } from "../../shared/db.js";
import { config } from "../../shared/config.js";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageBytes = 5 * 1024 * 1024;

export class AssetError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

export async function saveShopImage(shopId: string, file: MultipartFile) {
  if (!allowedImageTypes.has(file.mimetype)) {
    throw new AssetError("Only jpg, png, webp, and gif images are allowed.", 400, "UNSUPPORTED_IMAGE_TYPE");
  }

  const extension = extname(file.filename || "").toLowerCase() || ".bin";
  const fileName = `${randomUUID()}${extension}`;
  const storageRoot = resolve(config.localStorageDir);
  const relativePath = join("assets", shopId, fileName).replace(/\\/g, "/");
  const absoluteDir = join(storageRoot, "assets", shopId);
  const absolutePath = join(absoluteDir, fileName);

  await mkdir(absoluteDir, { recursive: true });
  await pipeline(file.file, createWriteStream(absolutePath));

  const size = (await stat(absolutePath)).size;
  if (size > maxImageBytes) {
    await unlink(absolutePath).catch(() => undefined);
    throw new AssetError("Image is larger than 5MB.", 413, "IMAGE_TOO_LARGE");
  }

  const result = await db.query(
    `
      insert into asset_objects (shop_id, storage_driver, bucket, object_key, public_url, mime_type, byte_size, purpose, created_by)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning id, shop_id, public_url, mime_type, byte_size, purpose, created_at
    `,
    [
      shopId,
      config.storageDriver,
      "local",
      relativePath,
      publicUrl(relativePath),
      file.mimetype,
      size,
      "image",
      "onboarding"
    ]
  );

  return result.rows[0];
}

function publicUrl(relativePath: string) {
  const cleanPath = relativePath.replace(/\\/g, "/");
  if (config.publicAssetBaseUrl) return `${config.publicAssetBaseUrl.replace(/\/$/, "")}/${cleanPath}`;
  return `/api/v1/assets/file/${cleanPath}`;
}

