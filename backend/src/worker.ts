import { completeJob, claimNextJob, failJob, recordWorkerHeartbeat } from "./modules/jobs/jobs.service.js";
import { markCommentActionNotConnected } from "./modules/comments/comments.service.js";
import { markCourierShipmentNotConnected } from "./modules/delivery/delivery.service.js";
import { markMetaCatalogSyncNotConnected, processMetaWebhookEvent } from "./modules/meta/meta.service.js";
import { embedAndIndexProductImage } from "./modules/ai/product-embedding.service.js";
import { processMessengerReplyJob, type MessengerReplyJobPayload } from "./modules/inbox/messenger-reply.service.js";
import { fileURLToPath } from "node:url";

const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
const pollMs = Number(process.env.WORKER_POLL_MS ?? 2000);
const heartbeatMs = Number(process.env.WORKER_HEARTBEAT_MS ?? 30000);
let stopping = false;
let nextHeartbeatAt = 0;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

export async function runOnce() {
  await heartbeat();
  const job = await claimNextJob(workerId);
  if (!job) return false;
  try {
    await handle(job.queue, job.job_type, job.payload);
    await completeJob(job.id, workerId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    await failJob(job.id, workerId, message, message.startsWith("RETRYABLE:"));
  }
  return true;
}

async function heartbeat(status: "running" | "stopping" = "running", force = false) {
  if (!force && Date.now() < nextHeartbeatAt) return;
  await recordWorkerHeartbeat(workerId, process.pid, status);
  nextHeartbeatAt = Date.now() + heartbeatMs;
}

async function handle(queue: string, jobType: string, payload: unknown) {
  if (queue === "analytics" && jobType === "analytics.rebuild") return;
  if (queue === "webhooks" && jobType === "meta.webhook.process") { await processMetaWebhookEvent(payloadValue(payload, "webhookEventId")); return; }
  if (queue === "comments" && jobType === "comment.action.dispatch") { await markCommentActionNotConnected(payloadValue(payload, "actionId")); return; }
  if (queue === "courier" && jobType === "courier.shipment.book") { await markCourierShipmentNotConnected(payloadValue(payload, "shipmentId")); return; }
  if (queue === "imports" && jobType === "meta.catalog.sync") { await markMetaCatalogSyncNotConnected(payloadValue(payload, "catalogSyncId")); return; }
  if (queue === "catalog" && jobType === "catalog.image.embed") {
    const p = payload as Record<string, string>;
    await embedAndIndexProductImage(p.shopId, p.productId, p.assetId ?? null, p.imageUrl);
    return;
  }
  if (queue === "messenger" && jobType === "messenger.reply.process") {
    await processMessengerReplyJob(payload as MessengerReplyJobPayload);
    return;
  }
  void payload;
  throw new Error(`Unsupported job type: ${queue}.${jobType}`);
}

function payloadValue(payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null || typeof (payload as Record<string, unknown>)[key] !== "string") throw new Error(`Invalid job payload: ${key}`);
  return (payload as Record<string, string>)[key];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  while (!stopping) {
    try { await runOnce(); } catch (error) { console.error("worker loop failed", error); }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  await heartbeat("stopping", true);
}
