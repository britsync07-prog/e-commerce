import { completeJob, claimNextJob, failJob } from "./modules/jobs/jobs.service.js";
import { fileURLToPath } from "node:url";

const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
const pollMs = Number(process.env.WORKER_POLL_MS ?? 2000);
let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

export async function runOnce() {
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

async function handle(queue: string, jobType: string, payload: unknown) {
  if (queue === "analytics" && jobType === "analytics.rebuild") return;
  if (queue === "webhooks" && jobType === "meta.webhook.process") throw new Error("RETRYABLE: Meta webhook processor is not connected yet.");
  if (queue === "imports" && jobType === "meta.catalog.sync") throw new Error("RETRYABLE: Meta catalog provider worker is not connected yet.");
  void payload;
  throw new Error(`Unsupported job type: ${queue}.${jobType}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  while (!stopping) {
    try { await runOnce(); } catch (error) { console.error("worker loop failed", error); }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
