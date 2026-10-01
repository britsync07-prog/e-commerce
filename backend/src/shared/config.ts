import { z } from "zod";
import { loadEnvFile } from "./load-env.js";

loadEnvFile();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  APP_ORIGIN: z.string().min(1),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  PUBLIC_ASSET_BASE_URL: z.string().default(""),
  ASSET_SIGNING_SECRET: z.string().min(32).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  STORAGE_PUBLIC_PREFIX: z.string().default("public"),
  STORAGE_PRIVATE_PREFIX: z.string().default("private"),
  METRICS_TOKEN: z.string().min(16).optional(),
  META_WEBHOOK_SECRET: z.string().min(16).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(8).optional(),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_OAUTH_REDIRECT_URI: z.string().url().optional(),
  META_OAUTH_SCOPES: z.string().default("pages_show_list,pages_read_engagement,pages_manage_metadata"),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),
  META_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  AUTH_OTP_SECRET: z.string().min(32).optional(),
  OTP_DELIVERY_WEBHOOK_URL: z.string().url().optional(),
  OTP_DELIVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  AUTH_COOKIE_ENABLED: z.enum(["true", "false"]).default("false"),
  AUTH_COOKIE_NAME: z.string().min(1).default("fcommerce_session"),
  AUTH_CSRF_COOKIE_NAME: z.string().min(1).default("fcommerce_csrf"),
  AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),
  AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  AUTH_COOKIE_SECURE: z.enum(["true", "false"]).optional()
});

const env = schema.parse(process.env);
const appOrigins = env.APP_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
const authCookieSecure = env.AUTH_COOKIE_SECURE ? env.AUTH_COOKIE_SECURE === "true" : env.NODE_ENV === "production";

for (const origin of appOrigins) {
  try {
    new URL(origin);
  } catch {
    throw new Error(`APP_ORIGIN contains an invalid URL: ${origin}`);
  }
}

if (env.NODE_ENV === "production") {
  if (!appOrigins.length) throw new Error("APP_ORIGIN is required in production.");
  if (appOrigins.some((origin) => /localhost|127\.0\.0\.1|\[::1\]/.test(origin))) {
    throw new Error("APP_ORIGIN must not use localhost in production.");
  }
  if (!env.ASSET_SIGNING_SECRET) throw new Error("ASSET_SIGNING_SECRET is required in production.");
  if (!env.METRICS_TOKEN) throw new Error("METRICS_TOKEN is required in production.");
  if (!env.AUTH_OTP_SECRET) throw new Error("AUTH_OTP_SECRET is required in production.");
}

if (env.AUTH_COOKIE_SAME_SITE === "none" && !authCookieSecure) {
  throw new Error("AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true.");
}

if (env.STORAGE_DRIVER === "s3") {
  const missing = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter((name) => !env[name as keyof typeof env]);
  if (missing.length) throw new Error(`S3 storage is missing: ${missing.join(", ")}`);
}

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  host: env.HOST,
  logLevel: env.LOG_LEVEL,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  appOrigins,
  storageDriver: env.STORAGE_DRIVER,
  localStorageDir: env.LOCAL_STORAGE_DIR,
  publicAssetBaseUrl: env.PUBLIC_ASSET_BASE_URL,
  assetSigningSecret: env.ASSET_SIGNING_SECRET,
  s3Endpoint: env.S3_ENDPOINT,
  s3Region: env.S3_REGION,
  s3Bucket: env.S3_BUCKET,
  s3AccessKeyId: env.S3_ACCESS_KEY_ID,
  s3SecretAccessKey: env.S3_SECRET_ACCESS_KEY,
  s3PublicBaseUrl: env.S3_PUBLIC_BASE_URL,
  storagePublicPrefix: env.STORAGE_PUBLIC_PREFIX,
  storagePrivatePrefix: env.STORAGE_PRIVATE_PREFIX,
  metricsToken: env.METRICS_TOKEN,
  metaWebhookSecret: env.META_WEBHOOK_SECRET,
  metaWebhookVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
  metaAppId: env.META_APP_ID,
  metaAppSecret: env.META_APP_SECRET,
  metaOAuthRedirectUri: env.META_OAUTH_REDIRECT_URI,
  metaOAuthScopes: env.META_OAUTH_SCOPES,
  metaGraphVersion: env.META_GRAPH_VERSION,
  metaTokenEncryptionKey: env.META_TOKEN_ENCRYPTION_KEY,
  authOtpSecret: env.AUTH_OTP_SECRET,
  otpDeliveryWebhookUrl: env.OTP_DELIVERY_WEBHOOK_URL,
  otpDeliveryTimeoutMs: env.OTP_DELIVERY_TIMEOUT_MS,
  authCookieEnabled: env.AUTH_COOKIE_ENABLED === "true",
  authCookieName: env.AUTH_COOKIE_NAME,
  authCsrfCookieName: env.AUTH_CSRF_COOKIE_NAME,
  authCookieDomain: env.AUTH_COOKIE_DOMAIN,
  authCookieSameSite: env.AUTH_COOKIE_SAME_SITE,
  authCookieSecure
};
