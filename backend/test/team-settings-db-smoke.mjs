import assert from "node:assert/strict";
import pg from "pg";
import { buildApp } from "../dist/app.js";

if (!process.env.DATABASE_URL) {
  console.log("Skipping team/settings DB smoke: DATABASE_URL is not set.");
  process.exit(0);
}

const app = await buildApp();
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
} catch {
  await app.close();
  console.log("Skipping team/settings DB smoke: database is not reachable.");
  process.exit(0);
}

try {
  const stamp = Date.now();
  const ownerEmail = `team-owner-${stamp}@example.com`;
  const staffEmail = `team-staff-${stamp}@example.com`;

  const ownerRegistered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Team Owner", email: ownerEmail, password: "strong-password-123", language: "en" }
  });
  assert.equal(ownerRegistered.statusCode, 201, ownerRegistered.body);

  const staffRegistered = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { name: "Team Staff", email: staffEmail, password: "strong-password-123", language: "en" }
  });
  assert.equal(staffRegistered.statusCode, 201, staffRegistered.body);
  const staffUserId = staffRegistered.json().user.id;

  const ownerLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: ownerEmail, password: "strong-password-123" } });
  assert.equal(ownerLogin.statusCode, 200, ownerLogin.body);
  const ownerToken = ownerLogin.json().token;
  const ownerUserId = ownerLogin.json().user.id;

  const staffLogin = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { identifier: staffEmail, password: "strong-password-123" } });
  assert.equal(staffLogin.statusCode, 200, staffLogin.body);
  const staffToken = staffLogin.json().token;

  const started = await app.inject({
    method: "POST",
    url: "/api/v1/onboarding/start",
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {
      ownerName: "Team Owner",
      language: "en",
      shopName: "Team Settings Shop",
      subdomain: `team-settings-${stamp}`,
      category: "test",
      country: "Bangladesh",
      currency: "BDT"
    }
  });
  assert.equal(started.statusCode, 201, started.body);
  const shopId = started.json().shop.id;

  const added = await app.inject({
    method: "POST",
    url: `/api/v1/shops/${shopId}/team`,
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { email: staffEmail, role: "sales" }
  });
  assert.equal(added.statusCode, 201, added.body);
  assert.equal(added.json().member.role, "sales");

  const team = await app.inject({
    method: "GET",
    url: `/api/v1/shops/${shopId}/team`,
    headers: { authorization: `Bearer ${ownerToken}` }
  });
  assert.equal(team.statusCode, 200, team.body);
  assert.equal(team.json().team.length, 2);

  const deniedTeamWrite = await app.inject({
    method: "POST",
    url: `/api/v1/shops/${shopId}/team`,
    headers: { authorization: `Bearer ${staffToken}` },
    payload: { email: ownerEmail, role: "admin" }
  });
  assert.equal(deniedTeamWrite.statusCode, 403, deniedTeamWrite.body);

  const settings = await app.inject({
    method: "PATCH",
    url: `/api/v1/shops/${shopId}/settings`,
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { displayName: "Updated Team Shop", policyDefaults: { deliveryCharge: 80, returnDays: 7, codAllowed: true } }
  });
  assert.equal(settings.statusCode, 200, settings.body);
  assert.equal(settings.json().settings.display_name, "Updated Team Shop");
  assert.equal(Number(settings.json().settings.policy_defaults.deliveryCharge), 80);

  const billing = await app.inject({ method: "GET", url: `/api/v1/shops/${shopId}/billing`, headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(billing.statusCode, 200, billing.body);
  assert.equal(billing.json().billing.code, "starter");
  assert.equal(Number(billing.json().usage.staff), 2);

  const sessions = await app.inject({ method: "GET", url: "/api/v1/auth/sessions", headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(sessions.statusCode, 200, sessions.body);
  assert.ok(sessions.json().sessions.length >= 1);
  const staffSessions = await app.inject({ method: "GET", url: "/api/v1/auth/sessions", headers: { authorization: `Bearer ${staffToken}` } });
  assert.equal(staffSessions.statusCode, 200, staffSessions.body);
  const revoked = await app.inject({ method: "POST", url: `/api/v1/auth/sessions/${staffSessions.json().sessions[0].id}/revoke`, headers: { authorization: `Bearer ${staffToken}` } });
  assert.equal(revoked.statusCode, 200, revoked.body);
  const authEvents = await client.query("select count(*)::int as count from auth_events where user_id = $1 and event_type = 'login'", [ownerUserId]);
  assert.ok(authEvents.rows[0].count >= 1);

  const selfRemove = await app.inject({
    method: "PATCH",
    url: `/api/v1/shops/${shopId}/team/${ownerUserId}`,
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { status: "disabled" }
  });
  assert.equal(selfRemove.statusCode, 409, selfRemove.body);

  const disabled = await app.inject({
    method: "PATCH",
    url: `/api/v1/shops/${shopId}/team/${staffUserId}`,
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { status: "disabled" }
  });
  assert.equal(disabled.statusCode, 200, disabled.body);
  assert.equal(disabled.json().member.status, "disabled");

  const audit = await app.inject({
    method: "GET",
    url: `/api/v1/shops/${shopId}/audit`,
    headers: { authorization: `Bearer ${ownerToken}` }
  });
  assert.equal(audit.statusCode, 200, audit.body);
  assert.ok(audit.json().audit.some((event) => event.action === "shop.settings_updated"));
  assert.ok(audit.json().audit.some((event) => event.action === "shop.team_member_updated"));

  console.log("Team/settings DB smoke passed.");
} finally {
  await client.end();
  await app.close();
}
