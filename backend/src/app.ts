import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./shared/config.js";
import { requestContextHook } from "./shared/request-context.js";
import { registerHealthRoutes } from "./modules/health/health.routes.js";
import { registerOnboardingRoutes } from "./modules/onboarding/onboarding.routes.js";
import { registerStorefrontRoutes } from "./modules/storefront/storefront.routes.js";
import { registerSystemRoutes } from "./modules/system/system.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  app.addHook("onRequest", requestContextHook);

  await app.register(helmet);
  await app.register(cors, { origin: config.appOrigin });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute"
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "F-commerce Backend API",
        version: "0.1.0"
      }
    }
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(registerHealthRoutes, { prefix: "/api/v1/health" });
  await app.register(registerSystemRoutes, { prefix: "/api/v1/system" });
  await app.register(registerOnboardingRoutes, { prefix: "/api/v1/onboarding" });
  await app.register(registerStorefrontRoutes, { prefix: "/api/v1/storefront" });

  return app;
}
