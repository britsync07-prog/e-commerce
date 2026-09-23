import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:4001";
const rootDomain = process.env.ROOT_DOMAIN ?? "localhost";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSubdomain(request) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const queryShop = url.searchParams.get("shop");
  if (queryShop) return queryShop;

  const hostname = (request.headers.host ?? "").split(":")[0].toLowerCase();
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") return "";
  if (hostname.endsWith(`.${rootDomain}`)) return hostname.slice(0, -(rootDomain.length + 1));

  return hostname.split(".")[0] ?? "";
}

async function loadShop(subdomain) {
  const response = await fetch(`${backendUrl}/api/v1/storefront/${encodeURIComponent(subdomain)}`);
  if (!response.ok) return undefined;
  return response.json();
}

function money(amount, currency) {
  return `${Number(amount).toLocaleString("en-US")} ${currency}`;
}

function renderNotFound(subdomain) {
  return renderPage({
    title: "Shop not found",
    body: `
      <main class="empty">
        <p class="eyebrow">Live test storefront</p>
        <h1>Shop not found</h1>
        <p>No launched shop found for <strong>${escapeHtml(subdomain || "this host")}</strong>.</p>
        <p class="hint">Local test: open <code>/?shop=your-subdomain</code> after launching a shop.</p>
      </main>
    `
  });
}

function renderStore(data) {
  const { shop, template, products } = data;
  const productCards = products.length
    ? products
        .map(
          (product) => `
            <article class="product">
              <div class="product-image">${product.imageUrl ? `<img src="${escapeHtml(product.imageUrl)}" alt="">` : "Product"}</div>
              <div>
                <h2>${escapeHtml(product.name)}</h2>
                <p>${money(product.price, shop.currency)}</p>
                <span>${product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}</span>
              </div>
              <button type="button">Order now</button>
            </article>
          `
        )
        .join("")
    : `<div class="empty-list">No products yet.</div>`;

  const accent = template.id === "test-gadget-basic" ? "#0f766e" : "#be123c";

  return renderPage({
    title: shop.displayName,
    accent,
    body: `
      <header class="hero">
        <nav>
          <strong>${escapeHtml(shop.displayName)}</strong>
          <span>${escapeHtml(shop.subdomain)}.${escapeHtml(rootDomain)}</span>
        </nav>
        <section>
          <p class="eyebrow">${escapeHtml(template.name)} · ${escapeHtml(shop.category)}</p>
          <h1>${escapeHtml(shop.displayName)}</h1>
          <p>COD ${shop.policyDefaults.codAllowed ? "available" : "not available"} · Delivery charge ${money(shop.policyDefaults.deliveryCharge, shop.currency)} · Returns ${shop.policyDefaults.returnDays} days</p>
        </section>
      </header>
      <main class="grid">
        ${productCards}
      </main>
      <footer>Test-only storefront. Not production template.</footer>
    `
  });
}

function renderPage({ title, body, accent = "#2563eb" }) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(title)}</title>
      <style>
        :root { color-scheme: light; --accent: ${accent}; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        body { margin: 0; color: #101828; background: #f6f7f9; }
        .hero { background: white; border-bottom: 1px solid #e4e7ec; }
        nav { display: flex; justify-content: space-between; gap: 16px; padding: 18px clamp(16px, 4vw, 56px); color: #475467; }
        nav strong { color: #101828; }
        .hero section, .grid, footer, .empty { max-width: 1120px; margin: 0 auto; padding: clamp(24px, 5vw, 56px); }
        .eyebrow { margin: 0 0 10px; color: var(--accent); font-weight: 700; text-transform: uppercase; font-size: 12px; letter-spacing: .08em; }
        h1 { margin: 0; font-size: clamp(34px, 7vw, 72px); line-height: .95; letter-spacing: 0; }
        .hero p:not(.eyebrow) { max-width: 680px; color: #475467; font-size: 18px; line-height: 1.6; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
        .product { background: white; border: 1px solid #e4e7ec; border-radius: 8px; padding: 14px; display: grid; gap: 14px; }
        .product-image { height: 180px; border-radius: 6px; background: linear-gradient(135deg, #f2f4f7, #e4e7ec); display: grid; place-items: center; color: #667085; font-weight: 700; }
        .product-image img { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; }
        h2 { margin: 0 0 8px; font-size: 18px; }
        .product p { margin: 0 0 4px; font-weight: 800; color: var(--accent); }
        .product span, footer, .hint { color: #667085; }
        button { height: 42px; border: 0; border-radius: 6px; background: var(--accent); color: white; font-weight: 800; cursor: pointer; }
        .empty, .empty-list { text-align: center; }
        code { background: #eef2ff; padding: 2px 6px; border-radius: 4px; }
      </style>
    </head>
    <body>${body}</body>
  </html>`;
}

const server = createServer(async (request, response) => {
  try {
    const subdomain = getSubdomain(request);
    const data = subdomain ? await loadShop(subdomain) : undefined;
    const html = data ? renderStore(data) : renderNotFound(subdomain);

    response.writeHead(data ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Storefront error: ${error instanceof Error ? error.message : "unknown"}`);
  }
});

server.listen(port, host, () => {
  console.log(`Storefront listening on http://${host}:${port}`);
});

