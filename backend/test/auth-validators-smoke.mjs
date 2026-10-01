import assert from "node:assert/strict";
import { passwordResetConfirmSchema, registerSchema } from "../dist/modules/auth/auth.validators.js";

assert.equal(registerSchema.safeParse({ name: "User", email: "u@example.com", password: "weakpass", language: "en" }).success, false);
assert.equal(registerSchema.safeParse({ name: "User", email: "u@example.com", password: "StrongPass123!", language: "en" }).success, true);
assert.equal(passwordResetConfirmSchema.safeParse({ identifier: "u@example.com", code: "123456", newPassword: "short" }).success, false);
assert.equal(passwordResetConfirmSchema.safeParse({ identifier: "u@example.com", code: "123456", newPassword: "NewStrongPass123!" }).success, true);

console.log("Auth validator smoke checks passed.");
