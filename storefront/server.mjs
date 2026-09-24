import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3100);
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
  if (hostname === rootDomain) return "";
  if (hostname.endsWith(`.${rootDomain}`)) return hostname.slice(0, -(rootDomain.length + 1));

  return hostname.split(".")[0] ?? "";
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function loadShop(subdomain) {
  const response = await fetch(`${backendUrl}/api/v1/storefront/${encodeURIComponent(subdomain)}`);
  if (!response.ok) return undefined;
  return response.json();
}

async function loadTemplates() {
  const response = await fetch(`${backendUrl}/api/v1/onboarding/templates`);
  if (!response.ok) return { templates: [] };
  return response.json();
}

async function postJson(path, payload) {
  const response = await fetch(`${backendUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "Request failed");
  return body;
}

async function patchJson(path, payload) {
  const response = await fetch(`${backendUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message ?? "Request failed");
  return body;
}

async function hostShop(fields) {
  const siteName = String(fields.get("siteName") ?? "").trim();
  const subdomain = String(fields.get("subdomain") ?? "").trim();
  const templateId = String(fields.get("templateId") ?? "test-fashion-basic").trim();
  const productName = String(fields.get("productName") ?? "Demo Product").trim() || "Demo Product";
  const price = Number(fields.get("price") ?? 999);

  const state = await postJson("/api/v1/onboarding/start", {
    ownerName: "Live Site Owner",
    language: "en",
    shopName: siteName,
    subdomain,
    category: templateId === "test-gadget-basic" ? "gadgets" : "fashion",
    country: "Bangladesh",
    currency: "BDT"
  });

  const shopId = state.shop.id;
  await postJson(`/api/v1/onboarding/${shopId}/products`, {
    name: productName,
    price: Number.isFinite(price) && price > 0 ? price : 999,
    stock: 10
  });
  await postJson(`/api/v1/onboarding/${shopId}/template`, { templateId });
  await postJson(`/api/v1/onboarding/${shopId}/channels/meta/skip`, {});
  await patchJson(`/api/v1/onboarding/${shopId}/ai-mode`, { aiMode: "suggest" });
  const launched = await postJson(`/api/v1/onboarding/${shopId}/launch`, {});

  return launched.shop.subdomain;
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
        <p class="hint">Go to <code>${escapeHtml(rootDomain)}</code>, create a site, choose a template, then press Host.</p>
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
          <p class="eyebrow">${escapeHtml(template.name)} - ${escapeHtml(shop.category)}</p>
          <h1>${escapeHtml(shop.displayName)}</h1>
          <p>COD ${shop.policyDefaults.codAllowed ? "available" : "not available"} - Delivery charge ${money(shop.policyDefaults.deliveryCharge, shop.currency)} - Returns ${shop.policyDefaults.returnDays} days</p>
        </section>
      </header>
      <main class="grid">
        ${productCards}
      </main>
      <footer>Test-only storefront. Not production template.</footer>
    `
  });
}

function renderBuilder({ templates, error } = { templates: [], error: "" }) {
  const templateInputs = templates
    .map(
      (template, index) => `
        <label class="template">
          <input type="radio" name="templateId" value="${escapeHtml(template.id)}" ${index === 0 ? "checked" : ""}>
          <span>
            <strong>${escapeHtml(template.name)}</strong>
            <small>${escapeHtml(template.bestFor.join(", "))}</small>
          </span>
        </label>
      `
    )
    .join("");

  return renderPage({
    title: "Host a test shop",
    body: `
      <main class="builder">
        <section class="builder-head">
          <p class="eyebrow">Shopify-like live test</p>
          <h1>Host a shop subdomain</h1>
          <p>Enter your site name, choose a test template, and press Host. It will launch at <code>your-name.${escapeHtml(rootDomain)}</code>.</p>
        </section>
        <form method="post" action="/host-site" class="host-form">
          ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
          <label>
            Site name
            <input name="siteName" required minlength="2" maxlength="120" placeholder="Saimon Fashion">
          </label>
          <label>
            Subdomain
            <input name="subdomain" required minlength="3" maxlength="40" pattern="[a-z0-9-]+" placeholder="saimon-fashion">
            <small>Use lowercase letters, numbers, and hyphen only.</small>
          </label>
          <label>
            First product
            <input name="productName" required minlength="2" maxlength="160" value="Demo Panjabi">
          </label>
          <label>
            Price
            <input name="price" required type="number" min="1" value="1250">
          </label>
          <fieldset>
            <legend>Template</legend>
            <div class="templates">${templateInputs}</div>
          </fieldset>
          <button type="submit">Host</button>
        </form>
      </main>
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
        .hero section, .grid, footer, .empty, .builder { max-width: 1120px; margin: 0 auto; padding: clamp(24px, 5vw, 56px); }
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
        .builder { display: grid; grid-template-columns: minmax(0, .9fr) minmax(300px, 1fr); gap: 28px; align-items: start; }
        .builder-head p:not(.eyebrow) { color: #475467; line-height: 1.6; font-size: 18px; }
        .host-form { background: white; border: 1px solid #e4e7ec; border-radius: 8px; padding: 18px; display: grid; gap: 14px; }
        label, fieldset { display: grid; gap: 6px; margin: 0; border: 0; padding: 0; font-weight: 700; }
        input { height: 42px; border: 1px solid #d0d5dd; border-radius: 6px; padding: 0 12px; font: inherit; }
        small { color: #667085; font-weight: 500; }
        .templates { display: grid; gap: 10px; }
        .template { grid-template-columns: 20px 1fr; align-items: start; border: 1px solid #e4e7ec; border-radius: 8px; padding: 12px; }
        .template input { width: 16px; height: 16px; margin-top: 3px; }
        .template span { display: grid; gap: 4px; }
        .template small { line-height: 1.4; }
        .error { border: 1px solid #fecdca; background: #fff1f3; color: #b42318; border-radius: 6px; padding: 10px 12px; font-weight: 700; }
        @media (max-width: 760px) { .builder { grid-template-columns: 1fr; } nav { display: grid; } }
      </style>
    </head>
    <body>${body}</body>
  </html>`;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "POST" && url.pathname === "/host-site") {
      const fields = new URLSearchParams(await readBody(request));
      const subdomain = await hostShop(fields);
      response.writeHead(303, { location: `http://${subdomain}.${rootDomain}` });
      response.end();
      return;
    }

    const subdomain = getSubdomain(request);
    if (!subdomain && url.pathname === "/") {
      const catalog = await loadTemplates();
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderBuilder({ templates: catalog.templates, error: "" }));
      return;
    }

    const data = subdomain ? await loadShop(subdomain) : undefined;
    const html = data ? renderStore(data) : renderNotFound(subdomain);
    response.writeHead(data ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  } catch (error) {
    const catalog = await loadTemplates().catch(() => ({ templates: [] }));
    response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
    response.end(renderBuilder({ templates: catalog.templates, error: error instanceof Error ? error.message : "Storefront error" }));
  }
});

server.listen(port, host, () => {
  console.log(`Storefront listening on http://${host}:${port}`);
});

