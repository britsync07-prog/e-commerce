import type { FastifyInstance } from "fastify";
import { onboardingStore } from "../onboarding/onboarding.store.js";
import { templateCatalog } from "../onboarding/template-catalog.js";

export async function registerStorefrontRoutes(app: FastifyInstance) {
  app.get("/:subdomain", async (request, reply) => {
    const { subdomain } = request.params as { subdomain: string };
    const data = onboardingStore.getData();
    const shop = data.shops.find((item) => item.subdomain === subdomain && item.status === "launched");

    if (!shop) {
      return reply.code(404).send({
        code: "SHOP_NOT_FOUND",
        message: "Published shop not found."
      });
    }

    const products = data.products.filter((item) => item.shopId === shop.id && item.status === "active");
    const template = templateCatalog.find((item) => item.id === shop.selectedTemplateId) ?? templateCatalog[0];

    return {
      shop: {
        id: shop.id,
        displayName: shop.displayName,
        subdomain: shop.subdomain,
        category: shop.category,
        country: shop.country,
        currency: shop.currency,
        logoUrl: shop.logoUrl,
        language: shop.language,
        policyDefaults: shop.policyDefaults,
        selectedTemplateId: template.id
      },
      template,
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        stock: product.stock,
        imageUrl: product.imageUrl,
        variants: product.variants,
        deliveryNotes: product.deliveryNotes
      }))
    };
  });
}

