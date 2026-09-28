import type pg from "pg";
import { db } from "../../shared/db.js";
import { lockInventoryVariants } from "../../shared/inventory-lock.js";

export class CatalogError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 160);
}

export async function createProduct(
  shopId: string,
  input: {
    name: string;
    slug?: string;
    description?: string;
    status: "draft" | "active";
    basePrice: number;
    currency: string;
    sku?: string;
    variantTitle: string;
    openingStock: number;
  }
) {
  const client = await db.connect();
  try {
    await client.query("begin");
    await ensureShop(client, shopId);

    const slug = slugify(input.slug || input.name);
    if (!slug) throw new CatalogError("Product slug is required.", 400, "SLUG_REQUIRED");

    const product = await client.query(
      `
        insert into products (shop_id, name, slug, description, status, base_price, currency)
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id, shop_id, name, slug, description, status, base_price, currency, created_at, updated_at
      `,
      [shopId, input.name, slug, input.description, input.status, input.basePrice, input.currency.toUpperCase()]
    );

    const variant = await client.query(
      `
        insert into product_variants (shop_id, product_id, sku, title, price)
        values ($1, $2, $3, $4, $5)
        returning id, shop_id, product_id, sku, title, price, status, created_at, updated_at
      `,
      [shopId, product.rows[0].id, input.sku || null, input.variantTitle, input.basePrice]
    );

    await writeInventory(client, shopId, variant.rows[0].id, "opening_stock", input.openingStock, "catalog");
    await writeAudit(client, shopId, "catalog.product_created", "product", product.rows[0].id, {
      variantId: variant.rows[0].id,
      openingStock: input.openingStock
    });

    await client.query("commit");
    return { product: product.rows[0], variants: [variant.rows[0]], stock: input.openingStock };
  } catch (error) {
    await client.query("rollback");
    if (isUniqueViolation(error)) throw new CatalogError("Product slug or SKU already exists for this shop.", 409, "PRODUCT_CONFLICT");
    throw error;
  } finally {
    client.release();
  }
}

export async function listProducts(shopId: string) {
  await ensureShop(db, shopId);
  const result = await db.query(
    `
      select p.id, p.shop_id, p.name, p.slug, p.status, p.base_price, p.currency, p.created_at, p.updated_at,
        coalesce(sum(il.delta_quantity), 0)::int as stock
      from products p
      left join product_variants pv on pv.product_id = p.id
      left join inventory_ledger il on il.variant_id = pv.id
      where p.shop_id = $1
      group by p.id
      order by p.created_at desc
      limit 100
    `,
    [shopId]
  );
  return { products: result.rows };
}

export async function getProduct(shopId: string, productId: string) {
  const product = await db.query(
    "select id, shop_id, name, slug, description, status, base_price, currency, created_at, updated_at from products where shop_id = $1 and id = $2",
    [shopId, productId]
  );
  if (!product.rowCount) throw new CatalogError("Product not found.", 404, "PRODUCT_NOT_FOUND");

  const variants = await db.query(
    `
      select pv.id, pv.shop_id, pv.product_id, pv.sku, pv.title, pv.price, pv.status, pv.created_at, pv.updated_at,
        coalesce(sum(il.delta_quantity), 0)::int as stock
      from product_variants pv
      left join inventory_ledger il on il.variant_id = pv.id
      where pv.shop_id = $1 and pv.product_id = $2
      group by pv.id
      order by pv.created_at asc
    `,
    [shopId, productId]
  );

  const images = await db.query(
    `select pi.id, pi.asset_id, pi.sort_order, pi.alt_text, ao.public_url, ao.mime_type, ao.byte_size
     from product_images pi join asset_objects ao on ao.id = pi.asset_id
     where pi.shop_id = $1 and pi.product_id = $2
     order by pi.sort_order asc, pi.created_at asc`,
    [shopId, productId]
  );

  return { product: product.rows[0], variants: variants.rows, images: images.rows };
}

export async function updateProduct(
  shopId: string,
  productId: string,
  input: { name?: string; description?: string | null; status?: "draft" | "active" | "archived"; basePrice?: number; currency?: string },
  actorId: string
) {
  const current = await db.query("select id, name, description, base_price, status from products where shop_id = $1 and id = $2", [shopId, productId]);
  if (!current.rowCount) throw new CatalogError("Product not found.", 404, "PRODUCT_NOT_FOUND");
  const name = input.name ?? current.rows[0].name;
  const basePrice = input.basePrice ?? Number(current.rows[0].base_price);
  const status = input.status ?? current.rows[0].status;
  const description = input.description === undefined ? current.rows[0].description : input.description;
  if (status === "active" && (!name.trim() || basePrice < 0)) {
    throw new CatalogError("Active products require a name and non-negative price.", 400, "PRODUCT_PUBLISH_INVALID");
  }

  const updated = await db.query(
    `
      update products
      set name = $3, description = $4, status = $5,
        base_price = $6, currency = coalesce($7, currency), updated_at = now()
      where shop_id = $1 and id = $2
      returning id, shop_id, name, slug, description, status, base_price, currency, created_at, updated_at
    `,
    [shopId, productId, name, description, status, basePrice, input.currency?.toUpperCase() ?? null]
  );
  await db.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'catalog.product_updated', 'product', $3, $4)",
    [shopId, actorId, productId, input]
  );
  return { product: updated.rows[0] };
}

export async function createVariant(
  shopId: string,
  productId: string,
  input: { title: string; sku?: string; price: number; openingStock: number },
  actorId: string
) {
  const client = await db.connect();
  try {
    await client.query("begin");
    const product = await client.query("select id from products where shop_id = $1 and id = $2", [shopId, productId]);
    if (!product.rowCount) throw new CatalogError("Product not found.", 404, "PRODUCT_NOT_FOUND");
    const variant = await client.query(
      `insert into product_variants (shop_id, product_id, sku, title, price)
       values ($1, $2, $3, $4, $5)
       returning id, shop_id, product_id, sku, title, price, status, created_at, updated_at`,
      [shopId, productId, input.sku ?? null, input.title, input.price]
    );
    await writeInventory(client, shopId, variant.rows[0].id, "opening_stock", input.openingStock, actorId);
    await writeAudit(client, shopId, "catalog.variant_created", "variant", variant.rows[0].id, { productId, openingStock: input.openingStock });
    await client.query("commit");
    return { variant: variant.rows[0], stock: input.openingStock };
  } catch (error) {
    await client.query("rollback");
    if ((error as { code?: string }).code === "23505") throw new CatalogError("SKU already exists for this shop.", 409, "SKU_CONFLICT");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateVariant(
  shopId: string,
  productId: string,
  variantId: string,
  input: { title?: string; sku?: string | null; price?: number; status?: "active" | "archived" },
  actorId: string
) {
  const current = await db.query("select id, title, sku, price, status from product_variants where shop_id = $1 and product_id = $2 and id = $3", [shopId, productId, variantId]);
  if (!current.rowCount) throw new CatalogError("Variant not found.", 404, "VARIANT_NOT_FOUND");
  try {
    const updated = await db.query(
      `update product_variants
       set title = $4, sku = $5, price = $6, status = $7, updated_at = now()
       where shop_id = $1 and product_id = $2 and id = $3
       returning id, shop_id, product_id, sku, title, price, status, created_at, updated_at`,
      [shopId, productId, variantId, input.title ?? current.rows[0].title, input.sku === undefined ? current.rows[0].sku : input.sku, input.price ?? current.rows[0].price, input.status ?? current.rows[0].status]
    );
    await db.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'catalog.variant_updated', 'variant', $3, $4)",
      [shopId, actorId, variantId, input]
    );
    return { variant: updated.rows[0] };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new CatalogError("SKU already exists for this shop.", 409, "SKU_CONFLICT");
    throw error;
  }
}

export async function importVariants(
  shopId: string,
  items: { productId: string; title: string; sku?: string; price: number; openingStock: number }[],
  actorId: string
) {
  const client = await db.connect();
  const imported: unknown[] = [];
  const skipped: { sku?: string; reason: string }[] = [];
  try {
    await client.query("begin");
    for (const item of items) {
      const product = await client.query("select id from products where shop_id = $1 and id = $2", [shopId, item.productId]);
      if (!product.rowCount) {
        skipped.push({ sku: item.sku, reason: "PRODUCT_NOT_FOUND" });
        continue;
      }
      const variant = await client.query(
        `insert into product_variants (shop_id, product_id, sku, title, price)
         values ($1, $2, $3, $4, $5)
         on conflict (shop_id, sku) do nothing
         returning id, product_id, sku, title, price, status`,
        [shopId, item.productId, item.sku ?? null, item.title, item.price]
      );
      if (!variant.rowCount) {
        skipped.push({ sku: item.sku, reason: "SKU_CONFLICT" });
        continue;
      }
      await writeInventory(client, shopId, variant.rows[0].id, "opening_stock", item.openingStock, actorId);
      imported.push({ ...variant.rows[0], openingStock: item.openingStock });
    }
    await writeAudit(client, shopId, "catalog.variants_imported", "shop", shopId, { imported: imported.length, skipped: skipped.length });
    await client.query("commit");
    return { imported, skipped };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function exportProductsCsv(shopId: string) {
  await ensureShop(db, shopId);
  const result = await db.query(
    `select p.name as product_name, p.slug, p.status as product_status, p.currency,
       pv.title as variant_title, pv.sku, pv.price, pv.status as variant_status,
       coalesce(sum(il.delta_quantity), 0)::int as stock
     from products p join product_variants pv on pv.shop_id = p.shop_id and pv.product_id = p.id
     left join inventory_ledger il on il.shop_id = pv.shop_id and il.variant_id = pv.id
     where p.shop_id = $1
     group by p.id, pv.id
     order by p.created_at desc, pv.created_at asc`,
    [shopId]
  );
  const headers = ["product_name", "slug", "product_status", "currency", "variant_title", "sku", "price", "variant_status", "stock"];
  const csv = [headers, ...result.rows.map((row) => headers.map((header) => csvCell(row[header])))]
    .map((row) => row.join(","))
    .join("\n");
  return { csv: `${csv}\n`, count: result.rowCount };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function ensureShop(client: Pick<pg.Pool | pg.PoolClient, "query">, shopId: string) {
  const shop = await client.query("select id from shops where id = $1", [shopId]);
  if (!shop.rowCount) throw new CatalogError("Shop not found.", 404, "SHOP_NOT_FOUND");
}

async function writeInventory(client: pg.PoolClient, shopId: string, variantId: string, reason: string, delta: number, actor: string) {
  await lockInventoryVariants(client, shopId, [variantId]);
  const current = await client.query("select coalesce(sum(delta_quantity), 0)::int as quantity from inventory_ledger where shop_id = $1 and variant_id = $2", [
    shopId,
    variantId
  ]);
  const quantityAfter = Number(current.rows[0].quantity) + delta;
  if (quantityAfter < 0) throw new CatalogError("Inventory cannot go below zero.", 409, "INSUFFICIENT_STOCK");

  await client.query(
    `
      insert into inventory_ledger (shop_id, variant_id, reason, delta_quantity, quantity_after, created_by)
      values ($1, $2, $3, $4, $5, $6)
    `,
    [shopId, variantId, reason, delta, quantityAfter, actor]
  );
}

async function writeAudit(client: pg.PoolClient, shopId: string, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  await client.query(
    `
      insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata)
      values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [shopId, "system", "catalog-api", action, targetType, targetId, metadata ?? null]
  );
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
