import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping auth DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1000 });
try {
  await client.connect();
} catch {
  await app.close();
  console.log("Skipping auth DB smoke: database is not reachable.");
  process.exit(0);
}
const stamp = Date.now();
const email = `auth-smoke-${stamp}@example.com`;
const otpSecret = process.env.AUTH_OTP_SECRET ?? `${process.env.DATABASE_URL}:${process.env.APP_ORIGIN ?? "http://localhost:3000"}`;
const codeHash = (code) => createHmac("sha256", otpSecret).update(code).digest("hex");

try {
  const registered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      name: "Auth Smoke",
      email,
      password: "strong-password-123",
      language: "en"
    }
  });

  assert.equal(registered.statusCode, 201, registered.body);

  const loggedIn = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      identifier: email,
      password: "strong-password-123"
    }
  });

  assert.equal(loggedIn.statusCode, 200, loggedIn.body);
  assert.ok(loggedIn.json().token);
  const token = loggedIn.json().token;

  const me = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  assert.equal(me.statusCode, 200, me.body);
  assert.equal(me.json().user.email, email);

  const verificationRequest = await app.inject({
    method: "POST",
    url: "/api/v1/auth/verification/request",
    headers: {
      authorization: `Bearer ${token}`
    },
    payload: {
      channel: "email"
    }
  });

  assert.equal(verificationRequest.statusCode, 201, verificationRequest.body);
  await client.query("update auth_challenges set code_hash = $2 where id = $1", [verificationRequest.json().challenge.id, codeHash("123456")]);

  const verificationConfirm = await app.inject({
    method: "POST",
    url: "/api/v1/auth/verification/confirm",
    payload: {
      challengeId: verificationRequest.json().challenge.id,
      code: "123456"
    }
  });

  assert.equal(verificationConfirm.statusCode, 200, verificationConfirm.body);
  assert.ok(verificationConfirm.json().user.email_verified_at);

  const resetRequest = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/request",
    payload: {
      identifier: email
    }
  });

  assert.equal(resetRequest.statusCode, 200, resetRequest.body);
  const resetChallenge = await client.query("select id from auth_challenges where purpose = 'password_reset' and user_id = $1 order by created_at desc limit 1", [registered.json().user.id]);
  assert.equal(resetChallenge.rowCount, 1);
  await client.query("update auth_challenges set code_hash = $2 where id = $1", [resetChallenge.rows[0].id, codeHash("654321")]);

  const resetConfirm = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password-reset/confirm",
    payload: {
      identifier: email,
      code: "654321",
      newPassword: "new-strong-password-123"
    }
  });

  assert.equal(resetConfirm.statusCode, 200, resetConfirm.body);

  const revokedAfterReset = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  assert.equal(revokedAfterReset.statusCode, 401, revokedAfterReset.body);

  const relogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      identifier: email,
      password: "new-strong-password-123"
    }
  });
  assert.equal(relogin.statusCode, 200, relogin.body);

  const logout = await app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: {
      authorization: `Bearer ${relogin.json().token}`
    }
  });

  assert.equal(logout.statusCode, 200, logout.body);

  const expired = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${relogin.json().token}`
    }
  });

  assert.equal(expired.statusCode, 401, expired.body);

  const rejected = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "wrong-password" } });
  assert.equal(rejected.statusCode, 401, rejected.body);
  const failedEvents = await client.query("select count(*)::int as count from auth_events where event_type = 'login_failed' and metadata->>'identifierHash' is not null");
  assert.ok(failedEvents.rows[0].count >= 1);
  console.log("Auth DB smoke passed.");
} finally {
  await client.end();
  await app.close();
}
