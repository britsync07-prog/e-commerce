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
  APP_ORIGIN: z.string().default("http://localhost:3000"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  PUBLIC_ASSET_BASE_URL: z.string().default(""),
  META_WEBHOOK_SECRET: z.string().min(16).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(8).optional(),
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_OAUTH_REDIRECT_URI: z.string().url().optional(),
  META_OAUTH_SCOPES: z.string().default("pages_show_list,pages_read_engagement,pages_manage_metadata"),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),
  META_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/).optional()
});

const env = schema.parse(process.env);

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  host: env.HOST,
  logLevel: env.LOG_LEVEL,
  databaseUrl: env.DATABASE_URL,
  redisUrl: env.REDIS_URL,
  appOrigin: env.APP_ORIGIN,
  storageDriver: env.STORAGE_DRIVER,
  localStorageDir: env.LOCAL_STORAGE_DIR,
  publicAssetBaseUrl: env.PUBLIC_ASSET_BASE_URL,
  metaWebhookSecret: env.META_WEBHOOK_SECRET,
  metaWebhookVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
  metaAppId: env.META_APP_ID,
  metaAppSecret: env.META_APP_SECRET,
  metaOAuthRedirectUri: env.META_OAUTH_REDIRECT_URI,
  metaOAuthScopes: env.META_OAUTH_SCOPES,
  metaGraphVersion: env.META_GRAPH_VERSION,
  metaTokenEncryptionKey: env.META_TOKEN_ENCRYPTION_KEY
};
