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

export async function saveShopImage(shopId: string, file: MultipartFile, actorId: string) {
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
      actorId
    ]
  );

  return result.rows[0];
}

export async function attachProductImage(
  shopId: string,
  productId: string,
  input: { assetId: string; altText?: string; sortOrder?: number },
  actorId: string
) {
  const product = await db.query("select id from products where shop_id = $1 and id = $2", [shopId, productId]);
  if (!product.rowCount) throw new AssetError("Product not found.", 404, "PRODUCT_NOT_FOUND");
  const asset = await db.query("select id, public_url, mime_type, byte_size from asset_objects where shop_id = $1 and id = $2", [shopId, input.assetId]);
  if (!asset.rowCount) throw new AssetError("Asset not found for this shop.", 404, "ASSET_NOT_FOUND");
  try {
    const image = await db.query(
      `insert into product_images (shop_id, product_id, asset_id, sort_order, alt_text)
       values ($1, $2, $3, $4, $5)
       returning id, shop_id, product_id, asset_id, sort_order, alt_text, created_at`,
      [shopId, productId, input.assetId, input.sortOrder ?? 0, input.altText ?? null]
    );
    await db.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'catalog.product_image_attached', 'product', $3, $4)",
      [shopId, actorId, productId, { assetId: input.assetId }]
    );
    return { image: { ...image.rows[0], ...asset.rows[0] } };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AssetError("Asset is already attached to this product.", 409, "IMAGE_ALREADY_ATTACHED");
    throw error;
  }
}

export async function removeProductImage(shopId: string, productId: string, imageId: string, actorId: string) {
  const image = await db.query("delete from product_images where shop_id = $1 and product_id = $2 and id = $3 returning id, asset_id", [shopId, productId, imageId]);
  if (!image.rowCount) throw new AssetError("Product image not found.", 404, "IMAGE_NOT_FOUND");
  await db.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'catalog.product_image_removed', 'product', $3, $4)",
    [shopId, actorId, productId, { imageId, assetId: image.rows[0].asset_id }]
  );
  return { removed: image.rows[0] };
}

function publicUrl(relativePath: string) {
  const cleanPath = relativePath.replace(/\\/g, "/");
  if (config.publicAssetBaseUrl) return `${config.publicAssetBaseUrl.replace(/\/$/, "")}/${cleanPath}`;
  return `/api/v1/assets/file/${cleanPath}`;
}
