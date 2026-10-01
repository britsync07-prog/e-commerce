import { config } from "../../shared/config.js";

export class GroqServiceError extends Error {
  constructor(message: string, public readonly statusCode = 502, public readonly code = "GROQ_SERVICE_FAILED") {
    super(message);
  }
}

export interface MatchedProductContext {
  id: string;
  name: string;
  price: number;
  currency: string;
  stock: number;
  variants?: Array<{ id: string; title: string; price: number; stock: number }>;
  policies?: {
    deliveryCharge?: number;
    returnDays?: number;
    codAllowed?: boolean;
  };
}

export interface AiBrainConfig {
  enabled: boolean;
  shopName?: string;
  tone?: string;
  language?: string;
  systemPrompt?: string;
  confidenceThreshold?: number;
  fallbackMessage?: string;
}

export interface GenerateReplyInput {
  aiBrain: AiBrainConfig;
  customerInquiry: string;
  matchedProduct: MatchedProductContext | null;
  history?: Array<{ source: "buyer" | "ai" | "staff"; body: string }>;
  overrideApiKey?: string;
}

export async function generateGroundedReply(input: GenerateReplyInput): Promise<string> {
  const { aiBrain, customerInquiry, matchedProduct, history = [], overrideApiKey } = input;
  const apiKey = overrideApiKey || config.groqApiKey;

  if (apiKey) {
    try {
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        {
          role: "system",
          content: buildSystemPrompt(aiBrain, matchedProduct)
        }
      ];

      for (const msg of history.slice(-6)) {
        messages.push({
          role: msg.source === "buyer" ? "user" : "assistant",
          content: msg.body
        });
      }

      messages.push({
        role: "user",
        content: customerInquiry
      });

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          temperature: 0.2,
          max_tokens: 300
        })
      });

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (!response.ok || !body.choices?.[0]?.message?.content) {
        throw new GroqServiceError(body.error?.message ?? "Groq API completion failed");
      }

      return body.choices[0].message.content.trim();
    } catch (err) {
      if (err instanceof GroqServiceError) throw err;
      console.warn("Groq API call failed, falling back to deterministic grounded reply:", err);
    }
  }

  // Deterministic grounded response generator
  return fallbackGroundedResponse(aiBrain, matchedProduct, customerInquiry);
}

function buildSystemPrompt(aiBrain: AiBrainConfig, product: MatchedProductContext | null): string {
  const shopName = aiBrain.shopName?.trim() || "our shop";
  const tone = aiBrain.tone || "friendly";
  const customPrompt = aiBrain.systemPrompt || "You are a helpful e-commerce sales assistant. Be polite and concise.";

  let prompt = `You are the official conversational sales assistant for "${shopName}".
Tone of voice: ${tone}.
${customPrompt}

MANDATORY SAFETY AND BUSINESS RULES:
1. NEVER invent, negotiate, or hallucinate prices, delivery charges, stock quantities, or policies.
2. Only quote information explicitly provided in the AUTHORITATIVE PRODUCT DETAILS section below.
3. If no product details are provided or the item is unknown, use the shop's fallback response politely and ask for details.
4. Reply in natural Bengali, Banglish, or English depending on how the customer messaged.
`;

  if (product) {
    const variantTitles = product.variants?.length
      ? product.variants.map((v) => `${v.title} (${v.stock > 0 ? "in stock" : "out of stock"})`).join(", ")
      : "Standard";
    const delivery = product.policies?.deliveryCharge !== undefined ? `${product.policies.deliveryCharge} ${product.currency}` : "standard delivery charge applies";
    const cod = product.policies?.codAllowed ? "Cash on delivery available" : "COD not available";

    prompt += `\nAUTHORITATIVE PRODUCT DETAILS:
- Product Name: ${product.name}
- Price: ${product.price} ${product.currency}
- Available Total Stock: ${product.stock} units
- Variants / Sizes: ${variantTitles}
- Delivery: ${delivery}
- Payment: ${cod}
`;
  } else {
    prompt += `\nNO SPECIFIC PRODUCT MATCHED: Politely ask the customer for the product name or a clearer picture.`;
  }

  return prompt;
}

function fallbackGroundedResponse(aiBrain: AiBrainConfig, product: MatchedProductContext | null, inquiry: string): string {
  if (!product) {
    return (
      aiBrain.fallbackMessage ||
      "ধন্যবাদ আপনার বার্তার জন্য! আমাদের জানান আপনি কোন প্রোডাক্টটি দেখতে চাচ্ছেন বা স্পষ্ট ছবি দিন, আমরা সাহায্য করছি।"
    );
  }

  const isBengali = /[\u0980-\u09FF]|koto|koto\?|ase|ase\?|dam|damm/i.test(inquiry);
  const stockInfo = product.stock > 0 ? "in stock" : "out of stock";

  if (isBengali) {
    if (product.stock <= 0) {
      return `দুঃখিত, ${product.name} বর্তমানে স্টক আউট আছে। স্টক আসলে আমরা আপডেট করে দেব।`;
    }
    const variants = product.variants?.length ? ` সাইজ/ভ্যারিয়েন্ট: ${product.variants.map((v) => v.title).join(", ")}।` : "";
    return `এই ${product.name}-এর দাম ${product.price} ${product.currency}।${variants} বর্তমানে এভেইলএবল আছে। আপনি কি অর্ডার করতে চান? 😊`;
  }

  if (product.stock <= 0) {
    return `Sorry, ${product.name} is currently out of stock.`;
  }
  const variants = product.variants?.length ? ` Available variants: ${product.variants.map((v) => v.title).join(", ")}.` : "";
  return `${product.name} is available for ${product.price} ${product.currency}.${variants} Would you like to place an order? 😊`;
}
