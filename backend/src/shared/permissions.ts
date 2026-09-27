import type { FastifyRequest } from "fastify";
import { bearerToken, getSession } from "../modules/auth/auth.service.js";
import { db } from "./db.js";

export const permissions = [
  "assets:write",
  "catalog:read",
  "catalog:write",
  "inventory:read",
  "inventory:write",
  "inbox:read",
  "inbox:write",
  "delivery:read",
  "delivery:write",
  "orders:read",
  "orders:write",
  "customers:read",
  "customers:write",
  "payments:read",
  "payments:write",
  "team:read",
  "team:write",
  "settings:read",
  "settings:write",
  "exports:run"
] as const;

export type Permission = (typeof permissions)[number];
export type Role = "owner" | "admin" | "sales" | "packer" | "marketer" | "accountant";

const rolePermissions: Record<Role, readonly Permission[]> = {
  owner: permissions,
  admin: permissions.filter((permission) => permission !== "team:write"),
  sales: ["catalog:read", "catalog:write", "inventory:read", "inbox:read", "inbox:write", "delivery:read", "delivery:write", "orders:read", "orders:write", "customers:read", "customers:write"],
  packer: ["inventory:read", "inventory:write", "delivery:read", "delivery:write", "orders:read", "orders:write"],
  marketer: ["assets:write", "catalog:read", "inbox:read", "inbox:write", "orders:read", "customers:read"],
  accountant: ["orders:read", "payments:read", "payments:write", "exports:run"]
};

export class PermissionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
  }
}

export async function requireAuth(request: FastifyRequest) {
  return getSession(bearerToken(request.headers.authorization));
}

export async function requireShopPermission(request: FastifyRequest, shopId: string, permission: Permission) {
  const session = await requireAuth(request);
  const staff = await db.query(
    "select role from shop_staff where shop_id = $1 and user_id = $2 and status = 'active'",
    [shopId, session.user.id]
  );

  if (!staff.rowCount) throw new PermissionError("Shop access is required.", 403, "SHOP_ACCESS_DENIED");
  const role = staff.rows[0].role as Role;
  if (!rolePermissions[role]?.includes(permission)) {
    throw new PermissionError("Permission denied.", 403, "PERMISSION_DENIED");
  }

  return { ...session, role, permissions: rolePermissions[role] };
}

export function publicRolePermissions() {
  return Object.fromEntries(Object.entries(rolePermissions).map(([role, values]) => [role, [...values]]));
}
