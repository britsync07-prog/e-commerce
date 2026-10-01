import assert from "node:assert/strict";

process.env.AUTH_COOKIE_ENABLED = "true";
process.env.DATABASE_URL ??= "postgres://user:password@localhost:5432/db";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.APP_ORIGIN ??= "http://localhost:3000";

const { parseCookies } = await import("../dist/shared/browser-session.js");

assert.deepEqual(parseCookies("fcommerce_session=a%2Bb; fcommerce_csrf=token"), {
  fcommerce_session: "a+b",
  fcommerce_csrf: "token"
});
assert.deepEqual(parseCookies(undefined), {});

console.log("Browser session smoke checks passed.");
