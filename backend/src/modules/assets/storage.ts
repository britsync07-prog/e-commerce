import { createHmac, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { config } from "../../shared/config.js";

export type AssetAccess = "public" | "private";

export type StoredAsset = {
  storageDriver: "local" | "s3";
  bucket: string;
  objectKey: string;
  publicUrl: string;
  byteSize: number;
};

export async function storeAsset(input: {
  shopId: string;
  fileName: string;
  mimeType: string;
  stream: Readable;
  maxBytes: number;
  access: AssetAccess;
}): Promise<StoredAsset> {
  const objectKey = objectKeyFor(input.access, input.shopId, input.fileName);
  if (config.storageDriver === "s3") {
    const body = await readLimited(input.stream, input.maxBytes);
    await putS3Object(objectKey, body, input.mimeType);
    return {
      storageDriver: "s3",
      bucket: config.s3Bucket!,
      objectKey,
      publicUrl: input.access === "public" ? publicObjectUrl(objectKey) : "",
      byteSize: body.length
    };
  }

  const root = resolve(config.localStorageDir);
  const path = resolve(join(root, objectKey));
  if (!path.startsWith(root)) throw new Error("Invalid storage path.");
  await mkdir(join(root, input.access, input.shopId), { recursive: true });
  await pipeline(input.stream, createWriteStream(path));
  const size = (await stat(path)).size;
  if (size > input.maxBytes) {
    await unlink(path).catch(() => undefined);
    throw Object.assign(new Error("File is too large."), { code: "FILE_TOO_LARGE" });
  }
  return {
    storageDriver: "local",
    bucket: "local",
    objectKey,
    publicUrl: input.access === "public" ? localPublicUrl(objectKey) : "",
    byteSize: size
  };
}

export async function localPrivateStream(objectKey: string) {
  const root = resolve(config.localStorageDir);
  const path = resolve(join(root, objectKey));
  if (!path.startsWith(root)) return null;
  try {
    await stat(path);
    return createReadStream(path);
  } catch {
    return null;
  }
}

export function signLocalPrivateUrl(assetId: string, expiresInSeconds = 300) {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const token = hmacHex(signingSecret(), `${assetId}:${expires}`);
  return `/api/v1/assets/private/${assetId}?expires=${expires}&token=${token}`;
}

export function verifyLocalPrivateUrl(assetId: string, expires: string, token: string) {
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  return hmacHex(signingSecret(), `${assetId}:${expiresAt}`) === token;
}

export async function signedAssetUrl(asset: { id: string; storage_driver: string; object_key: string; public_url: string }) {
  if (asset.public_url) return asset.public_url;
  if (asset.storage_driver === "s3") return presignS3Get(asset.object_key, 300);
  return signLocalPrivateUrl(asset.id, 300);
}

function objectKeyFor(access: AssetAccess, shopId: string, fileName: string) {
  const prefix = access === "public" ? config.storagePublicPrefix : config.storagePrivatePrefix;
  return join(prefix, shopId, basename(fileName)).replace(/\\/g, "/");
}

function localPublicUrl(objectKey: string) {
  if (config.publicAssetBaseUrl) return `${config.publicAssetBaseUrl.replace(/\/$/, "")}/${objectKey}`;
  return `/api/v1/assets/file/${objectKey}`;
}

function publicObjectUrl(objectKey: string) {
  const base = config.s3PublicBaseUrl || config.publicAssetBaseUrl;
  if (base) return `${base.replace(/\/$/, "")}/${objectKey}`;
  const endpoint = new URL(config.s3Endpoint!);
  return `${endpoint.origin}/${config.s3Bucket}/${encodeKey(objectKey)}`;
}

async function readLimited(stream: Readable, maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw Object.assign(new Error("File is too large."), { code: "FILE_TOO_LARGE" });
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function putS3Object(objectKey: string, body: Buffer, mimeType: string) {
  const endpoint = new URL(config.s3Endpoint!);
  const path = `/${config.s3Bucket}/${encodeKey(objectKey)}`;
  const date = amzDate();
  const payloadHash = sha256Hex(body);
  const headers = {
    "content-type": mimeType,
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": date.long
  };
  const authorization = authorizationHeader("PUT", path, "", headers, payloadHash, date.short);
  const response = await fetch(`${endpoint.origin}${path}`, { method: "PUT", body: body as unknown as BodyInit, headers: { ...headers, authorization } });
  if (!response.ok) throw new Error(`S3 upload failed with ${response.status}`);
}

function presignS3Get(objectKey: string, expiresSeconds: number) {
  const endpoint = new URL(config.s3Endpoint!);
  const path = `/${config.s3Bucket}/${encodeKey(objectKey)}`;
  const date = amzDate();
  const scope = credentialScope(date.short);
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.s3AccessKeyId}/${scope}`,
    "X-Amz-Date": date.long,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host"
  });
  const canonical = canonicalRequest("GET", path, query.toString(), { host: endpoint.host }, "UNSIGNED-PAYLOAD");
  const signature = signString(stringToSign(date.long, scope, canonical), date.short);
  query.set("X-Amz-Signature", signature);
  return `${endpoint.origin}${path}?${query.toString()}`;
}

function authorizationHeader(method: string, path: string, query: string, headers: Record<string, string>, payloadHash: string, date: string) {
  const scope = credentialScope(date);
  const signedHeaders = Object.keys(headers).sort().join(";");
  const signature = signString(stringToSign(headers["x-amz-date"], scope, canonicalRequest(method, path, query, headers, payloadHash)), date);
  return `AWS4-HMAC-SHA256 Credential=${config.s3AccessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function canonicalRequest(method: string, path: string, query: string, headers: Record<string, string>, payloadHash: string) {
  const keys = Object.keys(headers).sort();
  return [method, path, query, keys.map((key) => `${key}:${headers[key]}`).join("\n") + "\n", keys.join(";"), payloadHash].join("\n");
}

function stringToSign(amzDateValue: string, scope: string, canonical: string) {
  return ["AWS4-HMAC-SHA256", amzDateValue, scope, sha256Hex(canonical)].join("\n");
}

function signString(value: string, date: string) {
  const kDate = hmac(`AWS4${config.s3SecretAccessKey}`, date);
  const kRegion = hmac(kDate, config.s3Region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  return hmacHex(kSigning, value);
}

function credentialScope(date: string) {
  return `${date}/${config.s3Region}/s3/aws4_request`;
}

function amzDate(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { long: iso, short: iso.slice(0, 8) };
}

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function sha256Hex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function signingSecret() {
  return config.assetSigningSecret ?? `${config.databaseUrl}:${config.appOrigins.join(",")}`;
}
