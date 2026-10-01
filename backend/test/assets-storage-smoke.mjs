import assert from "node:assert/strict";
import { detectAssetMime, signLocalPrivateUrl, verifyLocalPrivateUrl } from "../dist/modules/assets/storage.js";

const assetId = "00000000-0000-4000-8000-000000000001";
const signed = signLocalPrivateUrl(assetId, 60);
const url = new URL(signed, "https://example.com");

assert.equal(verifyLocalPrivateUrl(assetId, url.searchParams.get("expires"), url.searchParams.get("token")), true);
assert.equal(verifyLocalPrivateUrl(assetId, "1", url.searchParams.get("token")), false);
assert.equal(verifyLocalPrivateUrl("00000000-0000-4000-8000-000000000002", url.searchParams.get("expires"), url.searchParams.get("token")), false);

assert.equal(detectAssetMime(Buffer.from([0xff, 0xd8, 0xff, 0xdb])), "image/jpeg");
assert.equal(detectAssetMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
assert.equal(detectAssetMime(Buffer.from("GIF89a", "ascii")), "image/gif");
assert.equal(detectAssetMime(Buffer.from("RIFF0000WEBP", "ascii")), "image/webp");
assert.equal(detectAssetMime(Buffer.from("%PDF-1.4", "ascii")), "application/pdf");
assert.equal(detectAssetMime(Buffer.from("not really an image", "utf8")), "application/octet-stream");

console.log("Asset storage smoke checks passed.");
