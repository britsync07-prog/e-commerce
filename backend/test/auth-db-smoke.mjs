import assert from "node:assert/strict";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping auth DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

const app = await buildApp();
const stamp = Date.now();
const email = `auth-smoke-${stamp}@example.com`;

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

  const me = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${loggedIn.json().token}`
    }
  });

  assert.equal(me.statusCode, 200, me.body);
  assert.equal(me.json().user.email, email);

  const logout = await app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: {
      authorization: `Bearer ${loggedIn.json().token}`
    }
  });

  assert.equal(logout.statusCode, 200, logout.body);

  const expired = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${loggedIn.json().token}`
    }
  });

  assert.equal(expired.statusCode, 401, expired.body);

  for (let attempt = 0; attempt < 9; attempt += 1) {
    const rejected = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "wrong-password" } });
    assert.equal(rejected.statusCode, 401, rejected.body);
  }
  const throttled = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: email, password: "wrong-password" } });
  assert.equal(throttled.statusCode, 429, throttled.body);
  console.log("Auth DB smoke passed.");
} finally {
  await app.close();
}
