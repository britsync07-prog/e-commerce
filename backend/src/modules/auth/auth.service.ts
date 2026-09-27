import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { db } from "../../shared/db.js";

const scrypt = promisify(scryptCallback);
const sessionDays = 30;

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
        returning id, name, email, phone, language, status, created_at
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
      from users
      where lower(email) = $1 or phone = $2
      limit 1
    `,
    [identifier, input.identifier]
  );

  if (!user.rowCount || !user.rows[0].password_hash) throw new AuthError("Invalid credentials.", 401, "INVALID_CREDENTIALS");
  if (user.rows[0].status !== "active") throw new AuthError("User is disabled.", 403, "USER_DISABLED");

  const ok = await verifyPassword(input.password, user.rows[0].password_hash);
  if (!ok) throw new AuthError("Invalid credentials.", 401, "INVALID_CREDENTIALS");

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
      select s.id as session_id, s.expires_at, u.id, u.name, u.email, u.phone, u.language, u.status, u.created_at
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

function publicUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    language: row.language,
    status: row.status,
    created_at: row.created_at
  };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
