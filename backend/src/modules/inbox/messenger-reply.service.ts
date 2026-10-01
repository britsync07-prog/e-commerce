import { db } from "../../shared/db.js";
import { vectorStore } from "../../shared/vector-store/index.js";
import { downloadImageBuffer, embedImage } from "../ai/gemini-embedding.service.js";
import { generateGroundedReply, type AiBrainConfig, type MatchedProductContext } from "../ai/groq.service.js";
import { sendMetaMessengerMessage } from "../meta/meta-messenger.service.js";
import type { MetaMessengerEvent } from "../meta/meta.service.js";

export interface MessengerReplyJobPayload {
  shopId: string;
  conversationId: string;
  messageId: string;
  buyerPsid: string;
  text?: string;
  attachmentUrl?: string;
}

export async function handleIncomingMessengerMessage(shopId: string, event: MetaMessengerEvent) {
  const client = await db.connect();
  let conversationId = "";
  let messageId = "";

  try {
    await client.query("begin");

    const convResult = await client.query(
      `
        insert into conversations (shop_id, channel, buyer_external_id, last_message_at, updated_at)
        values ($1, 'messenger', $2, now(), now())
        on conflict (shop_id, channel, buyer_external_id)
        do update set last_message_at = now(), updated_at = now()
        returning id, ai_enabled, ai_paused
      `,
      [shopId, event.senderId]
    );

    const conv = convResult.rows[0];
    conversationId = conv.id;

    const bodyText = event.text?.trim() || (event.attachmentUrl ? "[Product Screenshot/Image]" : "[Message]");
    const metadata = {
      attachmentUrl: event.attachmentUrl,
      attachmentType: event.attachmentType,
      platform: event.platform
    };

    const msgResult = await client.query(
      `
        insert into conversation_messages (
          shop_id, conversation_id, source, external_message_id, body, metadata, created_by
        )
        values ($1, $2, 'buyer', $3, $4, $5, $6)
        on conflict (shop_id, external_message_id) do nothing
        returning id
      `,
      [shopId, conversationId, event.messageId, bodyText, JSON.stringify(metadata), event.senderId]
    );

    if (msgResult.rowCount) {
      messageId = msgResult.rows[0].id;

      // Check if AI is enabled for shop and conversation
      const shopResult = await client.query("select ai_brain from shops where id = $1", [shopId]);
      const aiBrain = (shopResult.rows[0]?.ai_brain ?? {}) as AiBrainConfig;

      if (aiBrain.enabled !== false && conv.ai_enabled !== false && !conv.ai_paused) {
        await client.query(
          `
            insert into outbox_jobs (shop_id, queue, job_type, payload, max_attempts)
            values ($1, 'messenger', 'messenger.reply.process', $2, 3)
          `,
          [
            shopId,
            JSON.stringify({
              shopId,
              conversationId,
              messageId,
              buyerPsid: event.senderId,
              text: event.text,
              attachmentUrl: event.attachmentUrl
            })
          ]
        );
      }
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }

  return { conversationId, messageId };
}

export async function processMessengerReplyJob(payload: MessengerReplyJobPayload) {
  const { shopId, conversationId, buyerPsid, text, attachmentUrl } = payload;

  const [shopRes, convRes, historyRes] = await Promise.all([
    db.query("select display_name, ai_brain, policy_defaults, currency from shops where id = $1", [shopId]),
    db.query("select ai_enabled, ai_paused from conversations where id = $1 and shop_id = $2", [conversationId, shopId]),
    db.query("select source, body from conversation_messages where conversation_id = $1 and shop_id = $2 order by created_at desc limit 6", [conversationId, shopId])
  ]);

  if (!shopRes.rowCount || !convRes.rowCount) return { skipped: true, reason: "SHOP_OR_CONVERSATION_NOT_FOUND" };
  if (convRes.rows[0].ai_enabled === false || convRes.rows[0].ai_paused) return { skipped: true, reason: "AI_DISABLED_FOR_CONVERSATION" };

  const shop = shopRes.rows[0];
  const aiBrain: AiBrainConfig = {
    enabled: true,
    shopName: shop.display_name,
    ...(shop.ai_brain as Record<string, unknown>)
  };

  const confidenceThreshold = aiBrain.confidenceThreshold ?? 0.70;
  let matchedProduct: MatchedProductContext | null = null;
  let matchSimilarity = 0;

  // 1. Visual Search via Customer Screenshot / Image Attachment
  if (attachmentUrl) {
    try {
      const { buffer, mimeType } = await downloadImageBuffer(attachmentUrl);
      const queryEmbedding = await embedImage(buffer, mimeType);
      const matches = await vectorStore.search(shopId, queryEmbedding, 1);

      if (matches.length > 0 && matches[0].similarity >= confidenceThreshold) {
        matchedProduct = await fetchProductTruth(shopId, matches[0].productId, shop.currency, shop.policy_defaults);
        matchSimilarity = matches[0].similarity;
      }
    } catch (err) {
      console.warn("Visual search error during Messenger reply:", err);
    }
  }

  // 2. Text Search Fallback
  if (!matchedProduct && text) {
    matchedProduct = await findProductByText(shopId, text, shop.currency, shop.policy_defaults);
  }

  // 3. Grounded Groq AI Conversation Generation
  const replyText = await generateGroundedReply({
    aiBrain,
    customerInquiry: text || "Details please",
    matchedProduct,
    history: historyRes.rows.reverse()
  });

  // 4. Outbound Meta Graph API Send
  const sendResult = await sendMetaMessengerMessage(shopId, buyerPsid, replyText);

  // 5. Record outbound AI message in database
  await db.query(
    `
      insert into conversation_messages (
        shop_id, conversation_id, source, external_message_id, body, intent, sentiment, metadata, created_by
      )
      values ($1, $2, 'ai', $3, $4, $5, 'neutral', $6, 'ai-engine')
    `,
    [
      shopId,
      conversationId,
      sendResult.messageId ?? `ai_${Date.now()}`,
      replyText,
      matchedProduct ? "product_inquiry" : "general_inquiry",
      JSON.stringify({
        matchedProductId: matchedProduct?.id ?? null,
        similarity: matchSimilarity,
        status: sendResult.status
      })
    ]
  );

  await db.query(
    "update conversations set last_message_at = now(), updated_at = now() where id = $1 and shop_id = $2",
    [conversationId, shopId]
  );

  return { replyText, matchedProductId: matchedProduct?.id, sendResult };
}

async function fetchProductTruth(
  shopId: string,
  productId: string,
  currency: string,
  policies: Record<string, unknown>
): Promise<MatchedProductContext | null> {
  const productRes = await db.query(
    `
      select p.id, p.name, p.base_price, p.currency,
             coalesce(sum(il.delta_quantity), 0)::int as stock
      from products p
      left join product_variants pv on pv.product_id = p.id
      left join inventory_ledger il on il.variant_id = pv.id
      where p.shop_id = $1 and p.id = $2 and p.status = 'active'
      group by p.id
    `,
    [shopId, productId]
  );

  if (!productRes.rowCount) return null;
  const p = productRes.rows[0];

  const variantsRes = await db.query(
    `
      select pv.id, pv.title, pv.price, coalesce(sum(il.delta_quantity), 0)::int as stock
      from product_variants pv
      left join inventory_ledger il on il.variant_id = pv.id
      where pv.shop_id = $1 and pv.product_id = $2 and pv.status = 'active'
      group by pv.id
    `,
    [shopId, productId]
  );

  return {
    id: p.id,
    name: p.name,
    price: Number(p.base_price),
    currency: p.currency || currency,
    stock: Number(p.stock),
    variants: variantsRes.rows.map((v) => ({
      id: v.id,
      title: v.title,
      price: Number(v.price),
      stock: Number(v.stock)
    })),
    policies: {
      deliveryCharge: typeof policies.deliveryCharge === "number" ? policies.deliveryCharge : undefined,
      returnDays: typeof policies.returnDays === "number" ? policies.returnDays : undefined,
      codAllowed: typeof policies.codAllowed === "boolean" ? policies.codAllowed : true
    }
  };
}

async function findProductByText(
  shopId: string,
  text: string,
  currency: string,
  policies: Record<string, unknown>
): Promise<MatchedProductContext | null> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (!words.length) return null;

  const productsRes = await db.query(
    `
      select p.id, p.name, p.base_price, p.currency,
             coalesce(sum(il.delta_quantity), 0)::int as stock
      from products p
      left join product_variants pv on pv.product_id = p.id
      left join inventory_ledger il on il.variant_id = pv.id
      where p.shop_id = $1 and p.status = 'active'
      group by p.id
      order by p.created_at desc
      limit 30
    `,
    [shopId]
  );

  const matched = productsRes.rows.find((p) => {
    const nameLower = p.name.toLowerCase();
    return words.some((w) => nameLower.includes(w));
  });

  if (!matched) return null;
  return fetchProductTruth(shopId, matched.id, currency, policies);
}
