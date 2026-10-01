import { config } from "../../shared/config.js";
import { db } from "../../shared/db.js";
import { decryptToken, MetaError } from "./meta.service.js";

export interface SendMessengerResult {
  sent: boolean;
  messageId?: string;
  recipientId: string;
  status: "delivered" | "simulated" | "failed";
  error?: string;
}

export async function sendMetaMessengerMessage(
  shopId: string,
  recipientPsid: string,
  text: string
): Promise<SendMessengerResult> {
  const connection = await db.query(
    `
      select id, page_id, encrypted_access_token, settings
      from meta_connections
      where shop_id = $1 and status = 'active'
      order by updated_at desc
      limit 1
    `,
    [shopId]
  );

  if (!connection.rowCount) {
    throw new MetaError("No active Facebook Page connected for this shop.", 409, "META_PAGE_NOT_CONNECTED");
  }

  const { page_id: pageId, encrypted_access_token: encryptedToken } = connection.rows[0];

  // In test / simulation mode without real Meta credentials
  if (!config.metaAppSecret || !config.metaTokenEncryptionKey || encryptedToken === "mock-encrypted-token") {
    return {
      sent: true,
      messageId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      recipientId: recipientPsid,
      status: "simulated"
    };
  }

  try {
    const accessToken = decryptToken(encryptedToken);
    const url = new URL(`https://graph.facebook.com/${config.metaGraphVersion}/me/messages`);
    url.searchParams.set("access_token", accessToken);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        message: { text },
        messaging_type: "RESPONSE"
      })
    });

    const body = (await response.json()) as { message_id?: string; recipient_id?: string; error?: { message?: string } };

    if (!response.ok || !body.message_id) {
      throw new MetaError(body.error?.message ?? "Meta Graph API message sending failed", response.status, "META_SEND_FAILED");
    }

    return {
      sent: true,
      messageId: body.message_id,
      recipientId: body.recipient_id ?? recipientPsid,
      status: "delivered"
    };
  } catch (err) {
    if (err instanceof MetaError) throw err;
    throw new MetaError(err instanceof Error ? err.message : "Failed to send Messenger message", 502, "META_SEND_FAILED");
  }
}
