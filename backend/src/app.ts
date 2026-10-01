import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import multipart from "@fastify/multipart";
import { config } from "./shared/config.js";
import { requestContextHook } from "./shared/request-context.js";
import { metricsOnRequest, metricsOnResponse } from "./shared/metrics.js";
import { browserSessionHook } from "./shared/browser-session.js";
import { registerAssetRoutes } from "./modules/assets/assets.routes.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerAnalyticsRoutes } from "./modules/analytics/analytics.routes.js";
import { registerCatalogRoutes } from "./modules/catalog/catalog.routes.js";
import { registerCommentRoutes } from "./modules/comments/comments.routes.js";
import { registerCustomerRoutes } from "./modules/customers/customers.routes.js";
import { registerDeliveryRoutes } from "./modules/delivery/delivery.routes.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerInboxRoutes } from "./modules/inbox/inbox.routes.js";
import { registerInventoryRoutes } from "./modules/inventory/inventory.routes.js";
import { registerMarketingRoutes } from "./modules/marketing/marketing.routes.js";
import { registerOnboardingRoutes } from "./modules/onboarding/onboarding.routes.js";
import { registerOrderRoutes } from "./modules/orders/orders.routes.js";
import { registerPaymentRoutes } from "./modules/payments/payments.routes.js";
import { registerShopRoutes } from "./modules/shops/shops.routes.js";
import { registerStorefrontRoutes } from "./modules/storefront/storefront.routes.js";
import { registerSystemRoutes } from "./modules/system/system.routes.js";
import { registerMetaRoutes } from "./modules/meta/meta.routes.js";
import { registerWebhookRoutes } from "./modules/webhooks/webhooks.routes.js";
import { registerAiRoutes } from "./modules/ai/ai.routes.js";
import { registerJobsRoutes } from "./modules/jobs/jobs.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  app.addHook("onRequest", requestContextHook);
  app.addHook("onRequest", metricsOnRequest);
  app.addHook("onRequest", browserSessionHook);
  app.addHook("onResponse", metricsOnResponse);

  await app.register(helmet);
  await app.register(cors, { origin: config.appOrigins, credentials: config.authCookieEnabled });
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1
    }
  });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });

  if (config.nodeEnv !== "production") {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "F-commerce Backend API",
          version: "0.1.0"
        }
      }
    });
    await app.register(swaggerUi, { routePrefix: "/docs" });
  }

  await app.register(registerAssetRoutes, { prefix: "/api/v1/assets" });
  await app.register(registerAuthRoutes, { prefix: "/api/v1/auth" });
  await app.register(registerAnalyticsRoutes, { prefix: "/api/v1/analytics" });
  await app.register(registerCatalogRoutes, { prefix: "/api/v1/catalog" });
  await app.register(registerCommentRoutes, { prefix: "/api/v1/comments" });
  await app.register(registerCustomerRoutes, { prefix: "/api/v1/customers" });
  await app.register(registerDeliveryRoutes, { prefix: "/api/v1/delivery" });
  await app.register(registerHealthRoutes, { prefix: "/api/v1/health" });
  await app.register(registerInboxRoutes, { prefix: "/api/v1/inbox" });
  await app.register(registerInventoryRoutes, { prefix: "/api/v1/inventory" });
  await app.register(registerMarketingRoutes, { prefix: "/api/v1/marketing" });
  await app.register(registerShopRoutes, { prefix: "/api/v1/shops" });
  await app.register(registerSystemRoutes, { prefix: "/api/v1/system" });
  await app.register(registerOnboardingRoutes, { prefix: "/api/v1/onboarding" });
  await app.register(registerOrderRoutes, { prefix: "/api/v1/orders" });
  await app.register(registerPaymentRoutes, { prefix: "/api/v1/payments" });
  await app.register(registerStorefrontRoutes, { prefix: "/api/v1/storefront" });
  await app.register(registerMetaRoutes, { prefix: "/api/v1/meta" });
  await app.register(registerWebhookRoutes, { prefix: "/api/v1/webhooks" });
  await app.register(registerAiRoutes, { prefix: "/api/v1/ai" });
  await app.register(registerJobsRoutes, { prefix: "/api/v1/jobs" });

  return app;
}
