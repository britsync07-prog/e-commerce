import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";

const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const publicAuthPaths = new Set([
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/auth/password-reset/request",
  "/api/v1/auth/password-reset/confirm",
  "/api/v1/auth/verification/confirm"
]);

export function browserSessionHook(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  if (!config.authCookieEnabled || request.headers.authorization) return done();

  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[config.authCookieName];
  if (!token) return done();

  if (unsafeMethods.has(request.method) && !publicAuthPaths.has(request.url.split("?")[0]) && !csrfTokenMatches(request, cookies)) {
    reply.code(403).send({ code: "CSRF_REQUIRED", message: "CSRF token is required for cookie-authenticated requests." });
    return;
  }

  request.headers.authorization = `Bearer ${token}`;
  done();
}

export function setBrowserSessionCookies(reply: FastifyReply, token: string) {
  if (!config.authCookieEnabled) return;
  const csrfToken = randomBytes(32).toString("base64url");
  reply.header("set-cookie", [
    cookie(config.authCookieName, token, { httpOnly: true, maxAge: sessionMaxAgeSeconds }),
    cookie(config.authCsrfCookieName, csrfToken, { maxAge: sessionMaxAgeSeconds })
  ]);
}

export function clearBrowserSessionCookies(reply: FastifyReply) {
  if (!config.authCookieEnabled) return;
  reply.header("set-cookie", [
    cookie(config.authCookieName, "", { httpOnly: true, maxAge: 0 }),
    cookie(config.authCsrfCookieName, "", { maxAge: 0 })
  ]);
}

export function parseCookies(header: unknown) {
  if (typeof header !== "string") return {} as Record<string, string>;
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [name, ...rest] = part.trim().split("=");
      return [name, decodeURIComponent(rest.join("="))];
    }).filter(([name]) => name)
  );
}

function csrfTokenMatches(request: FastifyRequest, cookies: Record<string, string>) {
  const cookieToken = cookies[config.authCsrfCookieName];
  const header = request.headers["x-csrf-token"];
  const headerToken = Array.isArray(header) ? header[0] : header;
  if (!cookieToken || typeof headerToken !== "string" || cookieToken.length !== headerToken.length) return false;
  return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
}

function cookie(name: string, value: string, options: { httpOnly?: boolean; maxAge: number }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAge}`,
    `SameSite=${config.authCookieSameSite}`
  ];
  if (config.authCookieDomain) parts.push(`Domain=${config.authCookieDomain}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (config.authCookieSecure) parts.push("Secure");
  return parts.join("; ");
}
