function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const appDir = requireEnv("APP_DIR");

module.exports = {
  apps: [
    {
      name: "fcommerce-backend",
      cwd: `${appDir}/backend`,
      script: "dist/server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: requireEnv("BACKEND_PORT"),
        HOST: requireEnv("BACKEND_HOST"),
        DATABASE_URL: requireEnv("DATABASE_URL"),
        REDIS_URL: requireEnv("REDIS_URL"),
        APP_ORIGIN: requireEnv("APP_ORIGIN"),
        STORAGE_DRIVER: requireEnv("STORAGE_DRIVER"),
        LOCAL_STORAGE_DIR: requireEnv("LOCAL_STORAGE_DIR")
      }
    },
    {
      name: "fcommerce-worker",
      cwd: `${appDir}/backend`,
      script: "dist/worker.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: requireEnv("DATABASE_URL"),
        REDIS_URL: requireEnv("REDIS_URL"),
        APP_ORIGIN: requireEnv("APP_ORIGIN"),
        STORAGE_DRIVER: requireEnv("STORAGE_DRIVER"),
        LOCAL_STORAGE_DIR: requireEnv("LOCAL_STORAGE_DIR")
      }
    },
    {
      name: "fcommerce-storefront",
      cwd: `${appDir}/storefront`,
      script: "server.mjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: requireEnv("STOREFRONT_PORT"),
        HOST: requireEnv("STOREFRONT_HOST"),
        BACKEND_URL: requireEnv("STOREFRONT_BACKEND_URL"),
        ROOT_DOMAIN: requireEnv("ROOT_DOMAIN")
      }
    }
  ]
};
