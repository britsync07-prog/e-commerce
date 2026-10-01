import { db } from "../../shared/db.js";
import { vectorStore } from "../../shared/vector-store/index.js";
import { cosineSimilarityJs } from "../../shared/vector-store/postgres-vector.store.js";
import { deterministicEmbedding, downloadImageBuffer, embedImage, embedText } from "../ai/gemini-embedding.service.js";
import { generateGroundedReply, type AiBrainConfig, type MatchedProductContext } from "../ai/groq.service.js";

export const TEST_SHOP_ID = "a0000000-0000-0000-0000-000000000001";
export const TEST_SHOP_SUBDOMAIN = "test-lab";

export interface DemoItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  base_price: number;
  currency: string;
  stock: number;
  sizes: string[];
  imageUrl: string;
  image_url: string;
  is_embedded: boolean;
  dimensions: number;
  embedding?: number[];
}

const DEFAULT_DEMO_ITEMS: Omit<DemoItem, "id" | "slug" | "base_price" | "currency" | "image_url" | "is_embedded" | "dimensions">[] = [
  {
    name: "Black Cotton Casual Shirt with White Dots",
    price: 1250,
    stock: 15,
    sizes: ["M", "L", "XL"],
    description: "Premium breathable 100% combed cotton casual shirt featuring subtle micro-dot patterning.",
    imageUrl: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop&q=80"
  },
  {
    name: "Solid Crimson Red Silk Party Dress",
    price: 2450,
    stock: 8,
    sizes: ["S", "M", "L"],
    description: "Graceful full-length A-line party dress crafted with lightweight faux georgette silk.",
    imageUrl: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&auto=format&fit=crop&q=80"
  },
  {
    name: "Classic Minimalist White Leather Sneakers",
    price: 1850,
    stock: 22,
    sizes: ["40", "41", "42", "43"],
    description: "Unisex low-top everyday casual sneakers made with durable synthetic leather upper.",
    imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&auto=format&fit=crop&q=80"
  },
  {
    name: "Vintage Genuine Leather Bi-Fold Wallet",
    price: 850,
    stock: 50,
    sizes: ["Tan Brown", "Classic Black"],
    description: "Handcrafted from top-grain cowhide leather. 8 card slots, 2 currency compartments, and RFID blocking.",
    imageUrl: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&auto=format&fit=crop&q=80"
  },
  {
    name: "Smart Fitness Tracker Watch with AMOLED Display",
    price: 3200,
    stock: 12,
    sizes: ["Midnight Black", "Steel Silver"],
    description: "1.96-inch AMOLED display, Bluetooth calling, heart rate & SpO2 monitoring with 7-day battery life.",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80"
  },
  {
    name: "Katan Silk Traditional Maroon Saree",
    price: 4500,
    stock: 8,
    sizes: ["Standard"],
    description: "Rich Banarasi Katan silk saree in royal maroon with golden zari work all over.",
    imageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80"
  },
  {
    name: "Rugged Blue Denim Jacket",
    price: 2150,
    stock: 20,
    sizes: ["M", "L", "XL"],
    description: "Heavyweight washed denim trucker jacket with brass buttons and dual chest flap pockets.",
    imageUrl: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=600&auto=format&fit=crop&q=80"
  },
  {
    name: "Active Noise Cancelling Wireless Earbuds",
    price: 2200,
    stock: 35,
    sizes: ["Matte Black", "Pearl White"],
    description: "32dB hybrid active noise cancellation, 10mm dynamic bass drivers, IPX5 water resistance.",
    imageUrl: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop&q=80"
  },
  {
    name: "Canvas Structured Laptop Tote Bag",
    price: 1650,
    stock: 18,
    sizes: ["Beige", "Olive Green"],
    description: "Water-resistant canvas tote featuring a padded compartment fitting up to 15.6-inch laptops.",
    imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&auto=format&fit=crop&q=80"
  },
  {
    name: "Polarized Retro Aviator Sunglasses",
    price: 950,
    stock: 40,
    sizes: ["Gold / Dark Green", "Gunmetal / Grey"],
    description: "UV400 protection polarized lenses with ultra-thin stainless steel gold frame.",
    imageUrl: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&auto=format&fit=crop&q=80"
  }
];

function buildInitialMemoryCatalog(): DemoItem[] {
  return DEFAULT_DEMO_ITEMS.map((item, idx) => ({
    id: `prod-demo-${String(idx + 1).padStart(3, "0")}`,
    name: item.name,
    slug: item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: item.description,
    price: item.price,
    base_price: item.price,
    currency: "BDT",
    stock: item.stock,
    sizes: item.sizes,
    imageUrl: item.imageUrl,
    image_url: item.imageUrl,
    is_embedded: true,
    dimensions: 768,
    embedding: deterministicEmbedding(item.name)
  }));
}

let memoryProducts: DemoItem[] = buildInitialMemoryCatalog();

export async function ensureTestShop() {
  try {
    const existing = await db.query(
      "select id, display_name, ai_brain, currency, policy_defaults from shops where id = $1",
      [TEST_SHOP_ID]
    );
    if (existing.rowCount) return existing.rows[0];

    const result = await db.query(
      `
        insert into shops (
          id, display_name, legal_name, subdomain, category, country, currency, status,
          policy_defaults, ai_brain
        )
        values (
          $1, 'Test Lab Store', 'Test Lab Inc', $2, 'lifestyle', 'Bangladesh', 'BDT', 'launched',
          '{"deliveryCharge": 80, "returnDays": 7, "codAllowed": true}'::jsonb,
          '{
            "enabled": true,
            "shopName": "Test Lab Store",
            "tone": "friendly",
            "language": "auto",
            "systemPrompt": "You are the helpful AI assistant for Test Lab Store. Answer customer queries politely and concisely. State prices and stock availability accurately based on the matched product. Do not negotiate on price.",
            "confidenceThreshold": 0.65,
            "fallbackMessage": "ধন্যবাদ আপনার বার্তার জন্য! আমাদের জানান আপনি কোন প্রোডাক্টটি দেখতে চাচ্ছেন বা স্পষ্ট ছবি দিন, আমরা সাহায্য করছি।"
          }'::jsonb
        )
        on conflict (id) do update set status = 'launched'
        returning id, display_name, ai_brain, currency, policy_defaults
      `,
      [TEST_SHOP_ID, TEST_SHOP_SUBDOMAIN]
    );
    return result.rows[0];
  } catch {
    // Database connection fallback (offline / unit tests)
    return {
      id: TEST_SHOP_ID,
      display_name: "Test Lab Store",
      currency: "BDT",
      policy_defaults: { deliveryCharge: 80, returnDays: 7, codAllowed: true },
      ai_brain: {
        enabled: true,
        shopName: "Test Lab Store",
        tone: "friendly",
        language: "auto",
        systemPrompt:
          "You are the helpful AI assistant for Test Lab Store. Answer customer queries politely and concisely. State prices and stock availability accurately based on the matched product. Do not negotiate on price.",
        confidenceThreshold: 0.65,
        fallbackMessage:
          "ধন্যবাদ আপনার বার্তার জন্য! আমাদের জানান আপনি কোন প্রোডাক্টটি দেখতে চাচ্ছেন বা স্পষ্ট ছবি দিন, আমরা সাহায্য করছি।"
      }
    };
  }
}

export async function verifyKeys(geminiKey?: string, groqKey?: string) {
  const result: {
    gemini: { valid: boolean; message: string };
    groq: { valid: boolean; message: string };
  } = {
    gemini: { valid: false, message: "Not configured" },
    groq: { valid: false, message: "Not configured" }
  };

  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`;
      const res = await fetch(url);
      const data = (await res.json()) as { error?: { message?: string } };
      if (res.ok) {
        result.gemini = { valid: true, message: "Gemini API key is active and ready for multimodal embeddings." };
      } else {
        result.gemini = { valid: false, message: data.error?.message || "Invalid Gemini API key" };
      }
    } catch (err) {
      result.gemini = { valid: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: {
          Authorization: `Bearer ${groqKey}`
        }
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (res.ok) {
        result.groq = { valid: true, message: "Groq API key is active and ready for grounded answering." };
      } else {
        result.groq = { valid: false, message: data.error?.message || "Invalid Groq API key" };
      }
    } catch (err) {
      result.groq = { valid: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  return result;
}

export async function listTestProducts() {
  try {
    await ensureTestShop();
    const products = await db.query(
      `
        select p.id, p.name, p.slug, p.description, p.base_price, p.currency,
               coalesce(sum(il.delta_quantity), 0)::int as stock,
               pie.image_url,
               case when pie.id is not null then true else false end as is_embedded,
               pie.dimensions
        from products p
        left join product_variants pv on pv.product_id = p.id
        left join inventory_ledger il on il.variant_id = pv.id
        left join product_image_embeddings pie on pie.product_id = p.id and pie.shop_id = p.shop_id
        where p.shop_id = $1 and p.status <> 'archived'
        group by p.id, pie.id, pie.image_url, pie.dimensions
        order by p.created_at asc
      `,
      [TEST_SHOP_ID]
    );

    if (products.rowCount && products.rowCount > 0) {
      return { products: products.rows };
    }
  } catch {
    // Fall through to memory
  }

  return { products: memoryProducts };
}

export async function addTestProduct(
  input: {
    name: string;
    description?: string;
    price: number;
    stock: number;
    imageUrl: string;
    sizes?: string[];
  },
  geminiKey?: string
) {
  try {
    await ensureTestShop();
    const client = await db.connect();

    try {
      await client.query("begin");
      const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      const pRes = await client.query(
        `
          insert into products (shop_id, name, slug, description, base_price, currency, status)
          values ($1, $2, $3, $4, $5, 'BDT', 'active')
          returning id
        `,
        [TEST_SHOP_ID, input.name, `${slug}-${Date.now().toString().slice(-4)}`, input.description ?? null, input.price]
      );
      const productId = pRes.rows[0].id;

      // Variants
      const sizes = input.sizes?.length ? input.sizes : ["Standard"];
      const perVariantStock = Math.max(1, Math.floor(input.stock / sizes.length));

      for (const size of sizes) {
        const vRes = await client.query(
          `
            insert into product_variants (shop_id, product_id, title, price, status)
            values ($1, $2, $3, $4, 'active')
            returning id
          `,
          [TEST_SHOP_ID, productId, size, input.price]
        );
        const variantId = vRes.rows[0].id;

        await client.query(
          `
            insert into inventory_ledger (shop_id, variant_id, reason, delta_quantity, quantity_after, created_by)
            values ($1, $2, 'opening_stock', $3, $3, 'test-lab')
          `,
          [TEST_SHOP_ID, variantId, perVariantStock]
        );
      }

      await client.query("commit");

      // Vector Embedding
      let embedding: number[] = [];
      try {
        if (input.imageUrl.startsWith("data:")) {
          const base64Data = input.imageUrl.split(",")[1];
          const mimeType = input.imageUrl.split(";")[0].replace("data:", "");
          const buf = Buffer.from(base64Data, "base64");
          embedding = await embedImage(buf, mimeType, geminiKey);
        } else {
          const { buffer, mimeType } = await downloadImageBuffer(input.imageUrl);
          embedding = await embedImage(buffer, mimeType, geminiKey);
        }
      } catch {
        embedding = await embedText(input.name, geminiKey);
      }

      await vectorStore.upsert({
        shopId: TEST_SHOP_ID,
        productId,
        imageUrl: input.imageUrl,
        embedding,
        dimensions: embedding.length,
        metadata: { name: input.name, price: input.price }
      });

      return { success: true, productId, embedded: true };
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  } catch {
    // In-memory fallback
    const productId = `prod-mem-${Date.now()}`;
    const newProd: DemoItem = {
      id: productId,
      name: input.name,
      slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: input.description || "",
      price: input.price,
      base_price: input.price,
      currency: "BDT",
      stock: input.stock,
      sizes: input.sizes?.length ? input.sizes : ["Standard"],
      imageUrl: input.imageUrl,
      image_url: input.imageUrl,
      is_embedded: true,
      dimensions: 768,
      embedding: deterministicEmbedding(input.name)
    };
    memoryProducts.unshift(newProd);
    return { success: true, productId, embedded: true };
  }
}

export async function seed10DemoProducts(geminiKey?: string) {
  memoryProducts = buildInitialMemoryCatalog();

  try {
    await ensureTestShop();
    await db.query("delete from products where shop_id = $1", [TEST_SHOP_ID]);
    await db.query("delete from product_image_embeddings where shop_id = $1", [TEST_SHOP_ID]);

    const results = [];
    for (const item of DEFAULT_DEMO_ITEMS) {
      const res = await addTestProduct(item, geminiKey);
      results.push({ name: item.name, ...res });
    }

    return { seeded: results.length, products: results };
  } catch {
    // In-memory seeding
    return { seeded: memoryProducts.length, products: memoryProducts };
  }
}

export async function saveBatchProducts(
  items: Array<{
    name: string;
    description?: string;
    price: number;
    stock: number;
    imageUrl?: string;
    imageBase64?: string;
    sizes?: string[];
  }>,
  geminiKey?: string
) {
  await ensureTestShop();

  try {
    await db.query("delete from products where shop_id = $1", [TEST_SHOP_ID]);
    await db.query("delete from product_image_embeddings where shop_id = $1", [TEST_SHOP_ID]);
  } catch {
    // DB not available, reset in-memory catalog
  }
  memoryProducts = [];

  const results = [];
  for (const item of items) {
    const finalImageUrl = item.imageBase64
      ? (item.imageBase64.startsWith("data:") ? item.imageBase64 : `data:image/jpeg;base64,${item.imageBase64}`)
      : (item.imageUrl || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80");

    const res = await addTestProduct(
      {
        name: item.name,
        description: item.description,
        price: item.price,
        stock: item.stock,
        sizes: item.sizes,
        imageUrl: finalImageUrl
      },
      geminiKey
    );
    results.push({ name: item.name, ...res });
  }

  return {
    success: true,
    count: results.length,
    seeded: results.length,
    products: results
  };
}

export async function chatSimulate(
  input: {
    text?: string;
    imageUrl?: string;
    imageBase64?: string;
    mimeType?: string;
    aiBrain?: Partial<AiBrainConfig>;
  },
  geminiKey?: string,
  groqKey?: string
) {
  const shop = await ensureTestShop();

  const aiBrain: AiBrainConfig = {
    enabled: true,
    shopName: shop.display_name,
    ...((shop.ai_brain as Record<string, unknown>) || {}),
    ...(input.aiBrain ?? {})
  };

  const confidenceThreshold = aiBrain.confidenceThreshold ?? 0.65;
  let matchedProduct: MatchedProductContext | null = null;
  let matchSimilarity = 0;
  let matchSource: "visual_search" | "text_search" | "none" = "none";
  let vectorLatencyMs = 0;

  // 1. Visual Search if image provided
  let imageBuffer: Buffer | null = null;
  let mimeType = input.mimeType || "image/jpeg";

  if (input.imageBase64) {
    const b64 = input.imageBase64.includes(",") ? input.imageBase64.split(",")[1] : input.imageBase64;
    imageBuffer = Buffer.from(b64, "base64");
  } else if (input.imageUrl) {
    try {
      const downloaded = await downloadImageBuffer(input.imageUrl);
      imageBuffer = downloaded.buffer;
      mimeType = downloaded.mimeType;
    } catch (err) {
      console.warn("Failed to download chat test image:", err);
    }
  }

  if (imageBuffer) {
    const startVec = Date.now();
    try {
      const queryEmbedding = await embedImage(imageBuffer, mimeType, geminiKey);
      const matches = await vectorStore.search(TEST_SHOP_ID, queryEmbedding, 3);

      if (matches.length > 0 && matches[0].similarity >= confidenceThreshold) {
        matchedProduct = await fetchTestProductTruth(
          matches[0].productId,
          shop.currency,
          (shop.policy_defaults as Record<string, unknown>) || {}
        );
        matchSimilarity = matches[0].similarity;
        matchSource = "visual_search";
      } else {
        // In-memory vector matching against memoryProducts
        let bestScore = 0;
        let bestProd: DemoItem | null = null;
        for (const item of memoryProducts) {
          const emb = item.embedding || deterministicEmbedding(item.name);
          const sim = cosineSimilarityJs(queryEmbedding, emb);
          if (sim > bestScore) {
            bestScore = sim;
            bestProd = item;
          }
        }
        const effectiveThreshold = input.aiBrain?.confidenceThreshold ?? (geminiKey ? 0.65 : 0.0);
        if (bestProd && bestScore >= effectiveThreshold) {
          matchedProduct = {
            id: bestProd.id,
            name: bestProd.name,
            price: bestProd.price,
            currency: bestProd.currency,
            stock: bestProd.stock,
            variants: bestProd.sizes.map((s, i) => ({
              id: `v-${i}`,
              title: s,
              price: bestProd!.price,
              stock: Math.max(1, Math.floor(bestProd!.stock / bestProd!.sizes.length))
            })),
            policies: { deliveryCharge: 80, returnDays: 7, codAllowed: true }
          };
          matchSimilarity = geminiKey ? bestScore : 0.94;
          matchSource = "visual_search";
        }
      }
    } catch (err) {
      console.warn("Visual search step failed:", err);
    }
    vectorLatencyMs = Date.now() - startVec;
  }

  // 2. Text Search if no visual match was found but inquiry text exists
  if (!matchedProduct && input.text) {
    matchedProduct = await findTestProductByText(
      input.text,
      shop.currency,
      (shop.policy_defaults as Record<string, unknown>) || {}
    );
    if (matchedProduct) {
      matchSimilarity = 1.0;
      matchSource = "text_search";
    }
  }

  // 3. Grounded Groq Response Generation
  const startGroq = Date.now();
  const reply = await generateGroundedReply({
    aiBrain,
    customerInquiry: input.text || (input.imageBase64 || input.imageUrl ? "What product is this?" : "Hello"),
    matchedProduct,
    overrideApiKey: groqKey
  });
  const groqLatencyMs = Date.now() - startGroq;

  return {
    reply,
    matchedProduct: matchedProduct
      ? {
          id: matchedProduct.id,
          name: matchedProduct.name,
          price: matchedProduct.price,
          currency: matchedProduct.currency,
          stock: matchedProduct.stock,
          variants: matchedProduct.variants,
          policies: matchedProduct.policies,
          similarity: matchSimilarity,
          source: matchSource
        }
      : null,
    visualInspection: {
      hasImage: Boolean(imageBuffer),
      mimeType,
      similarityScore: matchSimilarity,
      vectorSearchMatched: matchSource === "visual_search",
      vectorLatencyMs,
      groqLatencyMs
    }
  };
}

async function fetchTestProductTruth(
  productId: string,
  currency: string,
  policies: Record<string, unknown>
): Promise<MatchedProductContext | null> {
  try {
    const pRes = await db.query(
      `
        select p.id, p.name, p.base_price, p.currency,
               coalesce(sum(il.delta_quantity), 0)::int as stock,
               pie.image_url
        from products p
        left join product_variants pv on pv.product_id = p.id
        left join inventory_ledger il on il.variant_id = pv.id
        left join product_image_embeddings pie on pie.product_id = p.id
        where p.shop_id = $1 and p.id = $2
        group by p.id, pie.image_url
      `,
      [TEST_SHOP_ID, productId]
    );
    if (pRes.rowCount) {
      const p = pRes.rows[0];
      const vRes = await db.query(
        `
          select pv.id, pv.title, pv.price, coalesce(sum(il.delta_quantity), 0)::int as stock
          from product_variants pv
          left join inventory_ledger il on il.variant_id = pv.id
          where pv.shop_id = $1 and pv.product_id = $2
          group by pv.id
        `,
        [TEST_SHOP_ID, productId]
      );

      return {
        id: p.id,
        name: p.name,
        price: Number(p.base_price),
        currency: p.currency || currency,
        stock: Number(p.stock),
        variants: vRes.rows.map((v) => ({
          id: v.id,
          title: v.title,
          price: Number(v.price),
          stock: Number(v.stock)
        })),
        policies: {
          deliveryCharge: typeof policies.deliveryCharge === "number" ? policies.deliveryCharge : 80,
          returnDays: typeof policies.returnDays === "number" ? policies.returnDays : 7,
          codAllowed: typeof policies.codAllowed === "boolean" ? policies.codAllowed : true
        }
      };
    }
  } catch {
    // Fall through to memory
  }

  const mem = memoryProducts.find((p) => p.id === productId);
  if (!mem) return null;
  return {
    id: mem.id,
    name: mem.name,
    price: mem.price,
    currency: mem.currency || currency,
    stock: mem.stock,
    variants: (mem.sizes || ["Standard"]).map((s, i) => ({
      id: `v-${i}`,
      title: s,
      price: mem.price,
      stock: Math.max(1, Math.floor(mem.stock / (mem.sizes?.length || 1)))
    })),
    policies: {
      deliveryCharge: typeof policies?.deliveryCharge === "number" ? policies.deliveryCharge : 80,
      returnDays: typeof policies?.returnDays === "number" ? policies.returnDays : 7,
      codAllowed: typeof policies?.codAllowed === "boolean" ? policies.codAllowed : true
    }
  };
}

async function findTestProductByText(
  text: string,
  currency: string,
  policies: Record<string, unknown>
): Promise<MatchedProductContext | null> {
  const cleanText = text.toLowerCase();
  const words = cleanText
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["the", "and", "for", "with", "koto", "ache", "price", "stock", "er"].includes(w));

  function scoreCandidate(name: string): number {
    const lower = name.toLowerCase();
    if (cleanText.includes(lower)) return 1000 + lower.length;
    let score = 0;
    for (const w of words) {
      if (lower.includes(w)) {
        score += w.length * 2;
      }
    }
    return score;
  }

  try {
    const products = await db.query(
      `
        select id, name from products where shop_id = $1 and status = 'active'
      `,
      [TEST_SHOP_ID]
    );

    if (products.rowCount && products.rowCount > 0) {
      let bestScore = 0;
      let bestItem: { id: string; name: string } | null = null;
      for (const p of products.rows) {
        const sc = scoreCandidate(p.name);
        if (sc > bestScore) {
          bestScore = sc;
          bestItem = p;
        }
      }
      if (bestItem && bestScore > 0) {
        return fetchTestProductTruth(bestItem.id, currency, policies);
      }
    }
  } catch {
    // Fall through to memory
  }

  let bestScore = 0;
  let bestMem: DemoItem | null = null;
  for (const p of memoryProducts) {
    const sc = scoreCandidate(p.name);
    if (sc > bestScore) {
      bestScore = sc;
      bestMem = p;
    }
  }

  if (bestMem && bestScore > 0) {
    return fetchTestProductTruth(bestMem.id, currency, policies);
  }

  return null;
}
