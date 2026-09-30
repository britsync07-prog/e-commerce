import { spawn } from "node:child_process";

const tests = [
  "test/auth-db-smoke.mjs",
  "test/catalog-db-smoke.mjs",
  "test/permissions-db-smoke.mjs",
  "test/orders-db-smoke.mjs",
  "test/order-dashboard-db-smoke.mjs",
  "test/order-drafts-db-smoke.mjs",
  "test/delivery-db-smoke.mjs",
  "test/inbox-db-smoke.mjs",
  "test/team-settings-db-smoke.mjs",
  "test/payments-db-smoke.mjs",
  "test/analytics-db-smoke.mjs",
  "test/customers-db-smoke.mjs",
  "test/meta-db-smoke.mjs",
  "test/comments-db-smoke.mjs",
  "test/ai-command-db-smoke.mjs",
  "test/ai-creative-db-smoke.mjs",
  "test/jobs-db-smoke.mjs",
  "test/worker-smoke.mjs",
  "test/onboarding.integration.mjs"
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for DB smoke tests.");
  process.exit(1);
}

let failed = false;

for (const test of tests) {
  console.log(`\n> node ${test}`);
  const result = await run(test);
  process.stdout.write(result.output);
  if (result.code !== 0) {
    failed = true;
    console.error(`DB smoke failed: ${test}`);
    break;
  }
  if (/Skipping .*?(DB smoke|database|DATABASE_URL|worker smoke|onboarding DB checks)/i.test(result.output)) {
    failed = true;
    console.error(`DB smoke skipped unexpectedly: ${test}`);
    break;
  }
}

if (failed) process.exit(1);
console.log("\nAll DB smoke tests passed.");

function run(test) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [test], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (code) => resolve({ code, output }));
  });
}
