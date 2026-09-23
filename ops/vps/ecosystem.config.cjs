module.exports = {
  apps: [
    {
      name: "fcommerce-backend",
      cwd: "/var/www/e-commerce/backend",
      script: "dist/server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "4001",
        HOST: "0.0.0.0",
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/fcommerce",
        REDIS_URL: "redis://localhost:6379"
      }
    },
    {
      name: "fcommerce-storefront",
      cwd: "/var/www/e-commerce/storefront",
      script: "server.mjs",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3100",
        HOST: "0.0.0.0",
        BACKEND_URL: "http://127.0.0.1:4001"
      }
    }
  ]
};
