import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual, createHash, createHmac } from "node:crypto";
import { promisify } from "node:util";
import { config } from "../../shared/config.js";
import { db } from "../../shared/db.js";

const scrypt = promisify(scryptCallback);
const sessionDays = 30;
const challengeTtlMinutes = 10;
const maxChallengeAttempts = 5;

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

export async function registerUser(input: { name: string; email?: string; phone?: string; password: string; language: string }) {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.query(
      `
        insert into users (name, email, phone, language, password_hash)
        values ($1, $2, $3, $4, $5)
        returning id, name, email, phone, language, status, email_verified_at, phone_verified_at, created_at
      `,
      [input.name, input.email?.toLowerCase() ?? null, input.phone ?? null, input.language, passwordHash]
    );
    await db.query("insert into auth_events (user_id, event_type, metadata) values ($1, 'registered', $2)", [user.rows[0].id, JSON.stringify({ method: "password" })]);
    return { user: user.rows[0] };
  } catch (error) {
    if (isUniqueViolation(error)) throw new AuthError("User already exists.", 409, "USER_EXISTS");
    throw error;
  }
}

export async function login(input: { identifier: string; password: string }, meta: { userAgent?: string; ipAddress?: string }) {
  const identifier = input.identifier.toLowerCase();
  const user = await db.query(
    `
      select id, name, email, phone, language, status, password_hash
        , email_verified_at, phone_verified_at, created_at
      from users
      where lower(email) = $1 or phone = $2
      limit 1
    `,
    [identifier, input.identifier]
  );

  if (!user.rowCount || !user.rows[0].password_hash) {
    await recordLoginEvent(null, "login_failed", meta, input.identifier);
    throw new AuthError("Invalid credentials.", 401, "INVALID_CREDENTIALS");
  }
  if (user.rows[0].status !== "active") {
    await recordLoginEvent(user.rows[0].id, "login_blocked", meta, input.identifier);
    throw new AuthError("User is disabled.", 403, "USER_DISABLED");
  }

  const ok = await verifyPassword(input.password, user.rows[0].password_hash);
  if (!ok) {
    await recordLoginEvent(user.rows[0].id, "login_failed", meta, input.identifier);
    throw new AuthError("Invalid credentials.", 401, "INVALID_CREDENTIALS");
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  const session = await db.query(
    `
      insert into user_sessions (user_id, token_hash, user_agent, ip_address, expires_at)
      values ($1, $2, $3, $4, $5)
      returning id, expires_at, created_at
    `,
    [user.rows[0].id, hashToken(token), meta.userAgent ?? null, meta.ipAddress ?? null, expiresAt]
  );

  await db.query("insert into auth_events (user_id, event_type, ip_address, user_agent, metadata) values ($1, 'login', $2, $3, $4)", [user.rows[0].id, meta.ipAddress ?? null, meta.userAgent ?? null, JSON.stringify({ sessionId: session.rows[0].id })]);
  return {
    token,
    session: session.rows[0],
    user: publicUser(user.rows[0])
  };
}

export async function getSession(token: string | undefined) {
  if (!token) throw new AuthError("Bearer token is required.", 401, "AUTH_REQUIRED");
  const result = await db.query(
    `
      select s.id as session_id, s.expires_at, u.id, u.name, u.email, u.phone, u.language, u.status, u.email_verified_at, u.phone_verified_at, u.created_at
      from user_sessions s
      join users u on u.id = s.user_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
      limit 1
    `,
    [hashToken(token)]
  );
  if (!result.rowCount) throw new AuthError("Session not found or expired.", 401, "SESSION_INVALID");
  if (result.rows[0].status !== "active") throw new AuthError("User is disabled.", 403, "USER_DISABLED");

  return {
    session: {
      id: result.rows[0].session_id,
      expires_at: result.rows[0].expires_at
    },
    user: publicUser(result.rows[0])
  };
}

export async function logout(token: string | undefined) {
  if (!token) throw new AuthError("Bearer token is required.", 401, "AUTH_REQUIRED");
  const session = await db.query("update user_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null returning id, user_id", [hashToken(token)]);
  if (session.rowCount) await db.query("insert into auth_events (user_id, event_type, metadata) values ($1, 'logout', $2)", [session.rows[0].user_id, JSON.stringify({ sessionId: session.rows[0].id })]);
  return { ok: true };
}

export async function listSessions(userId: string) {
  const result = await db.query("select id, user_agent, ip_address, expires_at, revoked_at, created_at from user_sessions where user_id = $1 order by created_at desc", [userId]);
  return { sessions: result.rows };
}

export async function revokeSession(userId: string, sessionId: string) {
  const result = await db.query("update user_sessions set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null returning id", [sessionId, userId]);
  if (!result.rowCount) throw new AuthError("Session not found or already revoked.", 404, "SESSION_NOT_FOUND");
  await db.query("insert into auth_events (user_id, event_type, metadata) values ($1, 'session_revoked', $2)", [userId, JSON.stringify({ sessionId })]);
  return { ok: true, sessionId };
}

export async function requestVerification(userId: string, channel: "email" | "phone") {
  const result = await db.query("select id, email, phone from users where id = $1 limit 1", [userId]);
  if (!result.rowCount) throw new AuthError("User not found.", 404, "USER_NOT_FOUND");
  const destination = channel === "email" ? result.rows[0].email : result.rows[0].phone;
  if (!destination) throw new AuthError("Contact method is missing.", 409, "CONTACT_METHOD_MISSING");

  const purpose = channel === "email" ? "email_verification" : "phone_verification";
  return createChallenge({ userId, purpose, destinationType: channel, destination, eventType: "verification_requested" });
}

export async function confirmVerification(input: { challengeId: string; code: string }) {
  const challenge = await consumeChallengeById(input.challengeId, input.code, ["email_verification", "phone_verification"]);
  const column = challenge.purpose === "email_verification" ? "email_verified_at" : "phone_verified_at";
  const event = challenge.purpose === "email_verification" ? "email_verified" : "phone_verified";
  const user = await db.query(
    `update users set ${column} = now() where id = $1 returning id, name, email, phone, language, status, email_verified_at, phone_verified_at, created_at`,
    [challenge.user_id]
  );
  await db.query("insert into auth_events (user_id, event_type, metadata) values ($1, $2, $3)", [challenge.user_id, event, JSON.stringify({ challengeId: challenge.id })]);
  return { ok: true, user: publicUser(user.rows[0]) };
}

export async function requestPasswordReset(identifierInput: string, meta: { userAgent?: string; ipAddress?: string }) {
  const identifier = identifierInput.trim();
  const normalized = identifier.toLowerCase();
  const result = await db.query("select id, email, phone from users where lower(email) = $1 or phone = $2 limit 1", [normalized, identifier]);
  if (!result.rowCount) return { ok: true, delivery: deliveryStub() };

  const row = result.rows[0];
  const destinationType = row.email?.toLowerCase() === normalized ? "email" : "phone";
  const destination = destinationType === "email" ? row.email : row.phone;
  if (!destination) return { ok: true, delivery: deliveryStub() };

  await createChallenge({ userId: row.id, purpose: "password_reset", destinationType, destination, eventType: "password_reset_requested", meta });
  return { ok: true, delivery: deliveryStub() };
}

export async function confirmPasswordReset(input: { identifier: string; code: string; newPassword: string }, meta: { userAgent?: string; ipAddress?: string }) {
  const identifier = input.identifier.trim();
  const normalized = identifier.toLowerCase();
  const result = await db.query("select id, email, phone from users where lower(email) = $1 or phone = $2 limit 1", [normalized, identifier]);
  if (!result.rowCount) throw new AuthError("Invalid or expired code.", 400, "AUTH_CODE_INVALID");

  const row = result.rows[0];
  const destinationType = row.email?.toLowerCase() === normalized ? "email" : "phone";
  const destination = destinationType === "email" ? row.email : row.phone;
  const challenge = await consumeChallengeByDestination("password_reset", destinationType, destination, input.code);
  if (challenge.user_id !== row.id) throw new AuthError("Invalid or expired code.", 400, "AUTH_CODE_INVALID");

  const verifiedColumn = destinationType === "email" ? "email_verified_at" : "phone_verified_at";
  await db.query(
    `update users set password_hash = $1, password_changed_at = now(), ${verifiedColumn} = coalesce(${verifiedColumn}, now()) where id = $2`,
    [await hashPassword(input.newPassword), row.id]
  );
  await db.query("update user_sessions set revoked_at = now() where user_id = $1 and revoked_at is null", [row.id]);
  await db.query(
    "insert into auth_events (user_id, event_type, ip_address, user_agent, metadata) values ($1, 'password_reset_completed', $2, $3, $4)",
    [row.id, meta.ipAddress ?? null, meta.userAgent ?? null, JSON.stringify({ challengeId: challenge.id })]
  );
  return { ok: true };
}

export function bearerToken(header: unknown) {
  if (typeof header !== "string") return undefined;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : undefined;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = Buffer.from(hash, "base64url");
  const derived = (await scrypt(password, salt, actual.length)) as Buffer;
  return actual.length === derived.length && timingSafeEqual(actual, derived);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashChallengeSecret(value: string) {
  return createHmac("sha256", config.authOtpSecret ?? `${config.databaseUrl}:${config.appOrigin}`).update(value).digest("hex");
}

function deliveryStub() {
  return { status: "queued", provider: "not_connected" };
}

async function createChallenge(input: { userId: string; purpose: string; destinationType: "email" | "phone"; destination: string; eventType: string; meta?: { userAgent?: string; ipAddress?: string } }) {
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + challengeTtlMinutes * 60 * 1000);
  await db.query("update auth_challenges set status = 'expired' where user_id = $1 and purpose = $2 and status = 'pending'", [input.userId, input.purpose]);
  const challenge = await db.query(
    `
      insert into auth_challenges (user_id, purpose, destination_type, destination_hash, code_hash, expires_at)
      values ($1, $2, $3, $4, $5, $6)
      returning id, purpose, destination_type, expires_at
    `,
    [input.userId, input.purpose, input.destinationType, hashToken(normalizeDestination(input.destinationType, input.destination)), hashChallengeSecret(code), expiresAt]
  );
  await db.query(
    "insert into auth_events (user_id, event_type, ip_address, user_agent, metadata) values ($1, $2, $3, $4, $5)",
    [input.userId, input.eventType, input.meta?.ipAddress ?? null, input.meta?.userAgent ?? null, JSON.stringify({ challengeId: challenge.rows[0].id, destinationType: input.destinationType })]
  );
  return {
    challenge: challenge.rows[0],
    delivery: deliveryStub(),
    ...(config.nodeEnv === "production" ? {} : { devCode: code })
  };
}

async function consumeChallengeById(challengeId: string, code: string, allowedPurposes: string[]) {
  const result = await db.query("select * from auth_challenges where id = $1 and status = 'pending' limit 1", [challengeId]);
  if (result.rows[0] && !allowedPurposes.includes(result.rows[0].purpose)) throw new AuthError("Invalid or expired code.", 400, "AUTH_CODE_INVALID");
  return consumeChallenge(result.rows[0], code);
}

async function consumeChallengeByDestination(purpose: string, destinationType: "email" | "phone", destination: string, code: string) {
  const result = await db.query(
    "select * from auth_challenges where purpose = $1 and destination_type = $2 and destination_hash = $3 and status = 'pending' order by created_at desc limit 1",
    [purpose, destinationType, hashToken(normalizeDestination(destinationType, destination))]
  );
  return consumeChallenge(result.rows[0], code);
}

async function consumeChallenge(challenge: Record<string, unknown> | undefined, code: string) {
  if (!challenge || new Date(challenge.expires_at as string).getTime() <= Date.now() || (challenge.attempts as number) >= maxChallengeAttempts) {
    if (challenge) await db.query("update auth_challenges set status = 'expired' where id = $1", [challenge.id]);
    throw new AuthError("Invalid or expired code.", 400, "AUTH_CODE_INVALID");
  }

  if (challenge.code_hash !== hashChallengeSecret(code)) {
    const attempts = (challenge.attempts as number) + 1;
    await db.query("update auth_challenges set attempts = $2, status = case when $2 >= $3 then 'expired' else status end where id = $1", [challenge.id, attempts, maxChallengeAttempts]);
    throw new AuthError("Invalid or expired code.", 400, "AUTH_CODE_INVALID");
  }

  await db.query("update auth_challenges set status = 'used', used_at = now() where id = $1", [challenge.id]);
  return challenge;
}

function normalizeDestination(type: "email" | "phone", value: string) {
  return type === "email" ? value.trim().toLowerCase() : value.trim();
}

function publicUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    language: row.language,
    status: row.status,
    email_verified_at: row.email_verified_at,
    phone_verified_at: row.phone_verified_at,
    created_at: row.created_at
  };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function recordLoginEvent(userId: unknown, eventType: "login_failed" | "login_blocked", meta: { userAgent?: string; ipAddress?: string }, identifier: string) {
  await db.query(
    "insert into auth_events (user_id, event_type, ip_address, user_agent, metadata) values ($1, $2, $3, $4, $5)",
    [userId, eventType, meta.ipAddress ?? null, meta.userAgent ?? null, JSON.stringify({ identifierHash: hashToken(identifier.toLowerCase()) })]
  );
}
