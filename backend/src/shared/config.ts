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
  PUBLIC_ASSET_BASE_URL: z.string().default("")
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
  publicAssetBaseUrl: env.PUBLIC_ASSET_BASE_URL
};
