# Assets API

Base path: `/api/v1/assets`

Purpose:
- Stores seller images for product photos, logos, proofs, and future uploads.
- Writes asset metadata to PostgreSQL.
- Uses local disk in dev/current VPS and keeps object-storage shape for S3/R2 later.

Auth:
- Temporary public route during live-test setup.
- Production rule: owner/staff session required, with shop upload permission.

## `POST /:shopId/images`

Request:
- Path param `shopId`: shop UUID.
- `multipart/form-data`.
- File field: `file`.
- Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Max size: 5MB.

Response:

```json
{
  "id": "uuid",
  "shop_id": "uuid",
  "public_url": "/api/v1/assets/file/assets/shop-id/file.webp",
  "mime_type": "image/webp",
  "byte_size": 12345,
  "purpose": "image",
  "created_at": "2026-09-24T00:00:00.000Z"
}
```

Side effects:
- Saves file under configured storage.
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
- `413 IMAGE_TOO_LARGE`
- `500` for storage or database failure.

## `GET /file/assets/:shopId/:fileName`

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

