import type { FastifyInstance } from "fastify";
import { db } from "../../shared/db.js";
import { templateCatalog } from "../onboarding/template-catalog.js";

export async function registerStorefrontRoutes(app: FastifyInstance) {
  app.get("/:subdomain", async (request, reply) => {
    const { subdomain } = request.params as { subdomain: string };
    const shop = await db.query(
      `
        select id, display_name, subdomain, category, country, currency, logo_url, language, address, policy_defaults,
          selected_template_id, storefront_config, published_storefront_config, publish_version, published_at, domain_status
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
        select p.id, p.name, p.slug, p.description, p.base_price, p.currency,
          coalesce(sum(il.delta_quantity), 0)::int as stock,
          min(ao.public_url) as image_url,
          coalesce(
            jsonb_agg(distinct jsonb_build_object('id', pi.id, 'assetId', ao.id, 'url', ao.public_url, 'altText', pi.alt_text, 'sortOrder', pi.sort_order))
              filter (where pi.id is not null),
            '[]'::jsonb
          ) as images
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
    const template = templateCatalog.find((item) => item.id === shop.rows[0].selected_template_id) ?? templateCatalog.find((item) => item.status === "production") ?? templateCatalog[0];
    const config = shop.rows[0].published_storefront_config ?? shop.rows[0].storefront_config ?? {};
    const contact = contactConfig(config);

    return {
      shop: {
        id: shop.rows[0].id,
        displayName: shop.rows[0].display_name,
        subdomain: shop.rows[0].subdomain,
        category: shop.rows[0].category,
        country: shop.rows[0].country,
        currency: shop.rows[0].currency,
        logoUrl: shop.rows[0].logo_url,
        address: shop.rows[0].address,
        language: shop.rows[0].language,
        policyDefaults: shop.rows[0].policy_defaults,
        selectedTemplateId: template.id,
        config,
        contact,
        orderActions: orderActions(config, contact),
        publishVersion: shop.rows[0].publish_version,
        publishedAt: shop.rows[0].published_at,
        domainStatus: shop.rows[0].domain_status
      },
      template,
      products: products.rows.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: Number(product.base_price),
        currency: product.currency,
        stock: product.stock,
        imageUrl: product.image_url,
        images: product.images,
        orderActions: orderActions(config, contact, product),
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
          min(ao.public_url) as image_url,
          coalesce(
            jsonb_agg(distinct jsonb_build_object('id', pi.id, 'assetId', ao.id, 'url', ao.public_url, 'altText', pi.alt_text, 'sortOrder', pi.sort_order))
              filter (where pi.id is not null),
            '[]'::jsonb
          ) as images
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
    const shop = await db.query("select published_storefront_config, storefront_config from shops where subdomain = $1 and status = 'launched' limit 1", [subdomain]);
    const config = shop.rows[0]?.published_storefront_config ?? shop.rows[0]?.storefront_config ?? {};
    const contact = contactConfig(config);
    return {
      product: {
        id: first.id,
        name: first.name,
        slug: first.slug,
        description: first.description,
        price: Number(first.base_price),
        currency: first.currency,
        imageUrl: first.image_url,
        images: first.images,
        orderActions: orderActions(config, contact, first),
        variants: result.rows.map((row) => ({ id: row.variant_id, sku: row.sku, title: row.variant_title, price: Number(row.variant_price), stock: row.stock }))
      }
    };
  });
}

function contactConfig(config: unknown) {
  const value = typeof config === "object" && config !== null ? (config as Record<string, unknown>).contact : undefined;
  return typeof value === "object" && value !== null ? value as Record<string, string> : {};
}

function orderActions(config: unknown, contact: Record<string, string>, product?: Record<string, unknown>) {
  const cta = typeof config === "object" && config !== null ? ((config as Record<string, unknown>).orderCta ?? {}) as Record<string, unknown> : {};
  const label = typeof cta.label === "string" ? cta.label : "Order now";
  const text = encodeURIComponent(product?.name ? `I want to order ${String(product.name)}` : "I want to order from your shop");
  const actions = [];
  if (contact.whatsappNumber) actions.push({ type: "whatsapp", label, url: `https://wa.me/${contact.whatsappNumber.replace(/[^0-9]/g, "")}?text=${text}` });
  if (contact.messengerUrl) actions.push({ type: "messenger", label: "Message on Messenger", url: contact.messengerUrl });
  if (contact.facebookPageUrl) actions.push({ type: "facebook", label: "Visit Facebook page", url: contact.facebookPageUrl });
  const primary = typeof cta.primary === "string" ? cta.primary : "whatsapp";
  return actions.sort((a, b) => Number(b.type === primary) - Number(a.type === primary));
}
