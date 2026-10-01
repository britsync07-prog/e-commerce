import { db } from "../../shared/db.js";
import { sendMetaMessengerMessage } from "../meta/meta-messenger.service.js";

export class InboxError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

type ProductHint = {
  id: string;
  name: string;
  base_price: string;
  currency: string;
  stock: number;
};

export async function listConversations(shopId: string, input: { status?: string; limit: number }) {
  const values: unknown[] = [shopId, input.limit];
  const statusFilter = input.status ? "and c.status = $3" : "";
  if (input.status) values.push(input.status);

  const conversations = await db.query(
    `
      select c.id, c.shop_id, c.channel, c.buyer_external_id, c.buyer_name, c.buyer_phone,
        c.intent, c.assigned_staff_id, c.ai_paused, c.status, c.last_message_at, c.created_at, c.updated_at,
        lm.body as last_message_body, lm.source as last_message_source,
        count(case when m.source = 'buyer' then 1 end)::int as buyer_message_count
      from conversations c
      left join lateral (
        select body, source from conversation_messages
        where conversation_id = c.id
        order by created_at desc
        limit 1
      ) lm on true
      left join conversation_messages m on m.conversation_id = c.id
      where c.shop_id = $1 ${statusFilter}
      group by c.id, lm.body, lm.source
      order by c.last_message_at desc nulls last, c.created_at desc
      limit $2
    `,
    values
  );
  return { conversations: conversations.rows };
}

export async function getConversation(shopId: string, conversationId: string) {
  const conversation = await db.query(
    "select id, shop_id, channel, buyer_external_id, buyer_name, buyer_phone, intent, assigned_staff_id, ai_paused, status, last_message_at, created_at, updated_at from conversations where shop_id = $1 and id = $2",
    [shopId, conversationId]
  );
  if (!conversation.rowCount) throw new InboxError("Conversation not found.", 404, "CONVERSATION_NOT_FOUND");

  const messages = await db.query(
    "select id, source, external_message_id, body, intent, sentiment, metadata, created_by, created_at from conversation_messages where shop_id = $1 and conversation_id = $2 order by created_at asc",
    [shopId, conversationId]
  );
  const drafts = await db.query(
    "select id, message_id, status, body, confidence, source_refs, escalation_reason, created_by, reviewed_by, reviewed_at, created_at, updated_at from ai_reply_drafts where shop_id = $1 and conversation_id = $2 order by created_at desc",
    [shopId, conversationId]
  );

  return { conversation: conversation.rows[0], messages: messages.rows, drafts: drafts.rows };
}

export async function createConversation(
  shopId: string,
  input: { channel: string; buyerExternalId: string; buyerName?: string; buyerPhone?: string; message?: string },
  actorId: string
) {
  const client = await db.connect();
  let conversationId = "";
  try {
    await client.query("begin");
    const conversation = await client.query(
      `
        insert into conversations (shop_id, channel, buyer_external_id, buyer_name, buyer_phone, last_message_at)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (shop_id, channel, buyer_external_id)
        do update set buyer_name = coalesce(excluded.buyer_name, conversations.buyer_name),
          buyer_phone = coalesce(excluded.buyer_phone, conversations.buyer_phone),
          updated_at = now()
        returning id
      `,
      [shopId, input.channel, input.buyerExternalId, input.buyerName ?? null, input.buyerPhone ?? null, input.message ? new Date() : null]
    );
    conversationId = conversation.rows[0].id;

    if (input.message) {
      await insertMessage(client, shopId, conversationId, "buyer", input.message, input.buyerExternalId, null);
    }

    await client.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'inbox.conversation_created', 'conversation', $3, $4)",
      [shopId, actorId, conversationId, { channel: input.channel }]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getConversation(shopId, conversationId);
}

export async function addMessage(
  shopId: string,
  conversationId: string,
  input: { source: "buyer" | "staff"; body: string; externalMessageId?: string },
  actorId: string
) {
  const client = await db.connect();
  let outboundResult: unknown = null;
  try {
    await client.query("begin");
    await ensureConversation(client, shopId, conversationId);
    await insertMessage(client, shopId, conversationId, input.source, input.body, actorId, input.externalMessageId ?? null);

    // If staff sends a message in a Messenger conversation, dispatch to Meta Messenger
    if (input.source === "staff") {
      const conv = await client.query(
        "select channel, buyer_external_id from conversations where shop_id = $1 and id = $2",
        [shopId, conversationId]
      );
      if (conv.rows[0]?.channel === "messenger" && conv.rows[0]?.buyer_external_id) {
        try {
          outboundResult = await sendMetaMessengerMessage(shopId, conv.rows[0].buyer_external_id, input.body);
        } catch (err) {
          console.warn("Outbound Messenger send failed during staff message:", err);
        }
      }
    }

    await client.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'inbox.message_added', 'conversation', $3, $4)",
      [shopId, actorId, conversationId, { source: input.source, outbound: outboundResult ? "dispatched" : "none" }]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getConversation(shopId, conversationId);
}

export async function getAiBrain(shopId: string) {
  const result = await db.query("select ai_brain from shops where id = $1", [shopId]);
  if (!result.rowCount) throw new InboxError("Shop not found.", 404, "SHOP_NOT_FOUND");
  return { aiBrain: result.rows[0].ai_brain ?? {} };
}

export async function updateAiBrain(shopId: string, input: Record<string, unknown>, actorId: string) {
  const current = await getAiBrain(shopId);
  const merged = { ...current.aiBrain, ...input };
  const result = await db.query(
    "update shops set ai_brain = $2, updated_at = now() where id = $1 returning ai_brain",
    [shopId, JSON.stringify(merged)]
  );
  if (!result.rowCount) throw new InboxError("Shop not found.", 404, "SHOP_NOT_FOUND");
  await db.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'inbox.ai_brain_updated', 'shop', $1, $3)",
    [shopId, actorId, JSON.stringify(input)]
  );
  return { aiBrain: result.rows[0].ai_brain };
}

export async function toggleConversationAi(shopId: string, conversationId: string, aiEnabled: boolean, actorId: string) {
  const result = await db.query(
    "update conversations set ai_enabled = $3, updated_at = now() where shop_id = $1 and id = $2 returning id, ai_enabled, ai_paused",
    [shopId, conversationId, aiEnabled]
  );
  if (!result.rowCount) throw new InboxError("Conversation not found.", 404, "CONVERSATION_NOT_FOUND");
  await db.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'inbox.conversation_ai_toggled', 'conversation', $3, $4)",
    [shopId, actorId, conversationId, JSON.stringify({ aiEnabled })]
  );
  return { conversation: result.rows[0] };
}

export async function assignConversation(shopId: string, conversationId: string, assignedStaffId: string | null, actorId: string) {
  const staff = assignedStaffId
    ? await db.query("select 1 from shop_staff where shop_id = $1 and user_id = $2 and status = 'active'", [shopId, assignedStaffId])
    : null;
  if (assignedStaffId && !staff?.rowCount) throw new InboxError("Assigned staff must belong to the shop.", 409, "STAFF_NOT_IN_SHOP");

  const result = await db.query("update conversations set assigned_staff_id = $3, updated_at = now() where shop_id = $1 and id = $2 returning id", [
    shopId,
    conversationId,
    assignedStaffId
  ]);
  if (!result.rowCount) throw new InboxError("Conversation not found.", 404, "CONVERSATION_NOT_FOUND");

  await db.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'inbox.conversation_assigned', 'conversation', $3, $4)",
    [shopId, actorId, conversationId, { assignedStaffId }]
  );
  return getConversation(shopId, conversationId);
}

export async function generateDraft(shopId: string, conversationId: string) {
  const client = await db.connect();
  let draftId = "";
  try {
    await client.query("begin");
    const conversation = await client.query("select id, ai_paused from conversations where shop_id = $1 and id = $2 for update", [shopId, conversationId]);
    if (!conversation.rowCount) throw new InboxError("Conversation not found.", 404, "CONVERSATION_NOT_FOUND");
    if (conversation.rows[0].ai_paused) throw new InboxError("AI is paused for this conversation.", 409, "AI_PAUSED");

    const message = await client.query(
      "select id, body from conversation_messages where shop_id = $1 and conversation_id = $2 and source = 'buyer' order by created_at desc limit 1",
      [shopId, conversationId]
    );
    if (!message.rowCount) throw new InboxError("Buyer message is required before drafting.", 409, "BUYER_MESSAGE_REQUIRED");

    const product = await findProductHint(shopId, message.rows[0].body);
    const escalationReason = escalationFor(message.rows[0].body, product);
    const body = draftBody(product, escalationReason);
    const sourceRefs = product ? [{ type: "product", id: product.id, name: product.name, price: product.base_price, currency: product.currency, stock: product.stock }] : [];
    const confidence = escalationReason ? 0.35 : product ? 0.78 : 0.45;
    const status = escalationReason ? "needs_review" : "suggested";

    const draft = await client.query(
      `
        insert into ai_reply_drafts (shop_id, conversation_id, message_id, status, body, confidence, source_refs, escalation_reason)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning id
      `,
      [shopId, conversationId, message.rows[0].id, status, body, confidence, JSON.stringify(sourceRefs), escalationReason]
    );
    draftId = draft.rows[0].id;

    await client.query(
      "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'system', 'suggest-only', 'inbox.ai_draft_created', 'ai_reply_draft', $2, $3)",
      [shopId, draftId, { conversationId, confidence, escalationReason }]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const detail = await getConversation(shopId, conversationId);
  return { draft: detail.drafts.find((draft) => draft.id === draftId), conversation: detail.conversation };
}

export async function reviewDraft(shopId: string, conversationId: string, draftId: string, input: { status: "approved" | "rejected"; note?: string }, actorId: string) {
  const result = await db.query(
    "update ai_reply_drafts set status = $4, reviewed_by = $5, reviewed_at = now(), updated_at = now() where shop_id = $1 and conversation_id = $2 and id = $3 and status in ('suggested', 'needs_review') returning id",
    [shopId, conversationId, draftId, input.status, actorId]
  );
  if (!result.rowCount) throw new InboxError("Reviewable draft not found.", 404, "DRAFT_NOT_FOUND");

  await db.query(
    "insert into audit_events (shop_id, actor_type, actor_id, action, target_type, target_id, metadata) values ($1, 'staff', $2, 'inbox.ai_draft_reviewed', 'ai_reply_draft', $3, $4)",
    [shopId, actorId, draftId, { status: input.status, note: input.note }]
  );
  return getConversation(shopId, conversationId);
}

async function ensureConversation(client: { query: typeof db.query }, shopId: string, conversationId: string) {
  const conversation = await client.query("select 1 from conversations where shop_id = $1 and id = $2", [shopId, conversationId]);
  if (!conversation.rowCount) throw new InboxError("Conversation not found.", 404, "CONVERSATION_NOT_FOUND");
}

async function insertMessage(
  client: { query: typeof db.query },
  shopId: string,
  conversationId: string,
  source: "buyer" | "staff",
  body: string,
  createdBy: string,
  externalMessageId: string | null
) {
  const intent = inferIntent(body);
  await client.query(
    `
      insert into conversation_messages (shop_id, conversation_id, source, external_message_id, body, intent, sentiment, created_by)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [shopId, conversationId, source, externalMessageId, body, intent, sentimentFor(body), createdBy]
  );
  await client.query("update conversations set intent = coalesce($3, intent), last_message_at = now(), updated_at = now() where shop_id = $1 and id = $2", [
    shopId,
    conversationId,
    intent
  ]);
}

async function findProductHint(shopId: string, message: string): Promise<ProductHint | null> {
  const words = message
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2)
    .slice(0, 8);
  const products = await db.query(
    `
      select p.id, p.name, p.base_price, p.currency, coalesce(sum(il.delta_quantity), 0)::int as stock
      from products p
      left join product_variants pv on pv.product_id = p.id
      left join inventory_ledger il on il.variant_id = pv.id
      where p.shop_id = $1 and p.status = 'active'
      group by p.id
      order by p.created_at desc
      limit 25
    `,
    [shopId]
  );
  if (!products.rowCount) return null;
  return products.rows.find((row) => words.some((word) => String(row.name).toLowerCase().includes(word))) ?? products.rows[0];
}

function inferIntent(body: string) {
  const text = body.toLowerCase();
  if (/\b(price|tk|৳|cost|koto|কত)\b/.test(text)) return "price";
  if (/\b(stock|available|ase|আছে)\b/.test(text)) return "availability";
  if (/\b(order|buy|nibo|নিব)\b/.test(text)) return "order_interest";
  if (/\b(refund|return|cancel)\b/.test(text)) return "support";
  return null;
}

function sentimentFor(body: string) {
  return /\b(angry|fraud|scam|legal|lawyer|abuse|refund)\b/i.test(body) ? "negative" : "neutral";
}

function escalationFor(body: string, product: ProductHint | null) {
  if (/\b(angry|fraud|scam|legal|lawyer|abuse|refund)\b/i.test(body)) return "sensitive_message";
  if (!product) return "no_product_source";
  if (product.stock <= 0) return "stock_unavailable";
  return null;
}

function draftBody(product: ProductHint | null, escalationReason: string | null) {
  if (!product) return "Thanks for your message. A team member will check the product details and reply shortly.";
  if (escalationReason === "stock_unavailable") return `${product.name} is currently out of stock. A team member can suggest an alternative.`;
  if (escalationReason) return "Thanks for your message. A team member will review this and reply shortly.";
  return `${product.name} is available. Price is ${product.base_price} ${product.currency}. Please share your phone number and delivery address to place an order.`;
}
