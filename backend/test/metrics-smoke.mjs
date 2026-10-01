import assert from "node:assert/strict";

process.env.METRICS_TOKEN = "metrics-smoke-token";

const { buildApp } = await import("../dist/app.js");

const app = await buildApp();

await app.inject({ method: "GET", url: "/api/v1/health" });

const forbidden = await app.inject({
  method: "GET",
  url: "/api/v1/health/metrics",
  headers: { "x-metrics-token": "wrong-token" }
});
assert.equal(forbidden.statusCode, 403);

const metrics = await app.inject({
  method: "GET",
  url: "/api/v1/health/metrics",
  headers: { "x-metrics-token": "metrics-smoke-token" }
});
assert.equal(metrics.statusCode, 200);
assert.ok(metrics.json().totalRequests >= 2);

await app.close();

console.log("Metrics smoke checks passed.");
