import assert from "node:assert/strict";
import { signLocalPrivateUrl, verifyLocalPrivateUrl } from "../dist/modules/assets/storage.js";

const assetId = "00000000-0000-4000-8000-000000000001";
const signed = signLocalPrivateUrl(assetId, 60);
const url = new URL(signed, "https://example.com");

assert.equal(verifyLocalPrivateUrl(assetId, url.searchParams.get("expires"), url.searchParams.get("token")), true);
assert.equal(verifyLocalPrivateUrl(assetId, "1", url.searchParams.get("token")), false);
assert.equal(verifyLocalPrivateUrl("00000000-0000-4000-8000-000000000002", url.searchParams.get("expires"), url.searchParams.get("token")), false);

console.log("Asset storage smoke checks passed.");
