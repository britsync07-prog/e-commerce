import type { FastifyInstance } from "fastify";
import { db } from "../../shared/db.js";
import { templateCatalog } from "../onboarding/template-catalog.js";

export async function registerStorefrontRoutes(app: FastifyInstance) {
  app.get("/:subdomain", async (request, reply) => {
    const { subdomain } = request.params as { subdomain: string };
    const shop = await db.query(
      `
        select id, display_name, subdomain, category, country, currency, logo_url, language, policy_defaults, selected_template_id, storefront_config
        from shops
        where subdomain = $1 and status = 'launched'
      `,
      [subdomain]
    );

    if (!shop.rowCount) {
      return reply.code(404).send({
        code: "SHOP_NOT_FOUND",
        message: "Published shop not found."
      });
    }

    const products = await db.query(
      `
        select p.id, p.name, p.base_price, p.currency,
          coalesce(sum(il.delta_quantity), 0)::int as stock,
          min(ao.public_url) as image_url
        from products p
        left join product_variants pv on pv.product_id = p.id
        left join inventory_ledger il on il.variant_id = pv.id
        left join product_images pi on pi.product_id = p.id
        left join asset_objects ao on ao.id = pi.asset_id
        where p.shop_id = $1 and p.status = 'active'
        group by p.id
        order by p.created_at desc
      `,
      [shop.rows[0].id]
    );
    const template = templateCatalog.find((item) => item.id === shop.rows[0].selected_template_id) ?? templateCatalog[0];

    return {
      shop: {
        id: shop.rows[0].id,
        displayName: shop.rows[0].display_name,
        subdomain: shop.rows[0].subdomain,
        category: shop.rows[0].category,
        country: shop.rows[0].country,
        currency: shop.rows[0].currency,
        logoUrl: shop.rows[0].logo_url,
        language: shop.rows[0].language,
        policyDefaults: shop.rows[0].policy_defaults,
        selectedTemplateId: template.id,
        config: shop.rows[0].storefront_config
      },
      template,
      products: products.rows.map((product) => ({
        id: product.id,
        name: product.name,
        price: Number(product.base_price),
        stock: product.stock,
        imageUrl: product.image_url,
        variants: [],
        deliveryNotes: undefined
      }))
    };
  });

  app.get("/:subdomain/products/:slug", async (request, reply) => {
    const { subdomain, slug } = request.params as { subdomain: string; slug: string };
    const result = await db.query(
      `
        select p.id, p.name, p.slug, p.description, p.base_price, p.currency,
          pv.id as variant_id, pv.sku, pv.title as variant_title, pv.price as variant_price,
          pv.status as variant_status, coalesce(sum(il.delta_quantity), 0)::int as stock,
          min(ao.public_url) as image_url
        from shops s
        join products p on p.shop_id = s.id and p.status = 'active' and p.slug = $2
        join product_variants pv on pv.product_id = p.id and pv.shop_id = p.shop_id and pv.status = 'active'
        left join inventory_ledger il on il.shop_id = pv.shop_id and il.variant_id = pv.id
        left join product_images pi on pi.shop_id = p.shop_id and pi.product_id = p.id
        left join asset_objects ao on ao.id = pi.asset_id
        where s.subdomain = $1 and s.status = 'launched'
        group by p.id, pv.id
        order by pv.created_at asc
      `,
      [subdomain, slug]
    );
    if (!result.rowCount) return reply.code(404).send({ code: "PRODUCT_NOT_FOUND", message: "Published product not found." });
    const first = result.rows[0];
    return {
      product: {
        id: first.id,
        name: first.name,
        slug: first.slug,
        description: first.description,
        price: Number(first.base_price),
        currency: first.currency,
        imageUrl: first.image_url,
        variants: result.rows.map((row) => ({ id: row.variant_id, sku: row.sku, title: row.variant_title, price: Number(row.variant_price), stock: row.stock }))
      }
    };
  });
}
