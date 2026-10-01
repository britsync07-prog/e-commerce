# Assets API

Base path: `/api/v1/assets`

Purpose:
- Stores seller images for product photos, logos, proofs, and future uploads.
- Writes asset metadata to PostgreSQL.
- Uses local disk or S3-compatible object storage such as Cloudflare R2.
- Public images receive stable CDN-friendly URLs.
- Payment proofs are private and require signed URLs.

Auth:
- Image upload requires bearer session and `assets:write`.
- Public image reads do not require auth.
- Private proof signed URL creation requires bearer session and `assets:write`.

## `POST /:shopId/images`

Request:
- Path param `shopId`: shop UUID.
- `multipart/form-data`.
- File field: `file`.
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Max size: 5MB.
- File content must match the declared MIME type.

Response:

```json
{
  "id": "uuid",
  "shop_id": "uuid",
  "public_url": "/api/v1/assets/file/public/shop-id/file.webp",
  "mime_type": "image/webp",
  "byte_size": 12345,
  "purpose": "image",
  "created_at": "2026-09-24T00:00:00.000Z"
}
```

Side effects:
- Saves file under configured storage under the public prefix.
- Inserts `asset_objects` row.

Audit/timeline:
- Current route stores metadata only.
- Production upload flow must write audit when linked to product, proof, logo, or policy-sensitive object.

Cache:
- Uploaded file URL can be cached long-term because file names are UUID-based.
- Metadata reads must refetch after replacement/delete.

Errors:
- `400 VALIDATION_ERROR`
- `400 FILE_REQUIRED`
- `400 UNSUPPORTED_IMAGE_TYPE`
- `400 IMAGE_CONTENT_INVALID`
- `401 AUTH_REQUIRED`
- `401 SESSION_INVALID`
- `403 SHOP_ACCESS_DENIED`
- `403 PERMISSION_DENIED`
- `413 IMAGE_TOO_LARGE`
- `500` for storage or database failure.

## `POST /:shopId/proofs`

Purpose: upload a private payment proof asset.

Request:
- Path param `shopId`: shop UUID.
- `multipart/form-data`.
- File field: `file`.
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`.
- Max size: 10MB.
- File content must match the declared MIME type.

Response:

```json
{
  "id": "uuid",
  "shop_id": "uuid",
  "public_url": "",
  "mime_type": "application/pdf",
  "byte_size": 12345,
  "purpose": "payment_proof",
  "created_at": "2026-09-24T00:00:00.000Z"
}
```

Side effects:
- Saves file under configured storage under the private prefix.
- Inserts `asset_objects` row.

Errors:
- `400 FILE_REQUIRED`
- `400 UNSUPPORTED_PROOF_TYPE`
- `400 PROOF_CONTENT_INVALID`
- `413 PROOF_TOO_LARGE`

## `GET /:shopId/files/:assetId/signed-url`

Purpose: return a temporary URL for a private proof or the stable public URL for a public asset.

Auth: Bearer session required; requires `assets:write`.

Response:

```json
{
  "url": "/api/v1/assets/private/asset-id?expires=123&token=signed",
  "expiresInSeconds": 300
}
```

Errors:
- `404 ASSET_NOT_FOUND`

## `GET /file/public/:shopId/:fileName`

Request:
- Path param `shopId`: shop UUID.
- Path param `fileName`: stored file name.
- No body.

Response:
- Image stream.

Side effects:
- None.

Audit/timeline:
- None for public image read.

Cache:
- `Cache-Control: public, max-age=31536000, immutable`.

Errors:
- `400 INVALID_PATH`
- `404 ASSET_NOT_FOUND`

## `GET /file/assets/:shopId/:fileName`

Compatibility route for assets uploaded before the public/private storage split.

## `GET /private/:assetId`

Purpose: serve a private local asset through a signed URL.

Auth: signed URL token in query string.

Errors:
- `403 SIGNED_URL_INVALID`
- `404 ASSET_NOT_FOUND`

## `POST /:shopId/products/:productId/images`

Purpose: attach an uploaded tenant-owned asset to a product.

Auth: Bearer session required; requires `assets:write`.

Request JSON: `{ "assetId": "uuid", "altText": "Black panjabi", "sortOrder": 0 }`.

Side effects: inserts `product_images` and writes `catalog.product_image_attached` audit data. Asset and product must belong to the same shop.

Errors: `400 VALIDATION_ERROR`, `404 ASSET_NOT_FOUND`, `404 PRODUCT_NOT_FOUND`, `409 IMAGE_ALREADY_ATTACHED`.

## `DELETE /:shopId/products/:productId/images/:imageId`

Purpose: detach an image from a product without deleting the underlying asset.

Auth: Bearer session required; requires `assets:write`.

Side effects: removes the product-image link and writes `catalog.product_image_removed` audit data. Existing orders and stored files are unchanged.

Errors: `404 IMAGE_NOT_FOUND`.
