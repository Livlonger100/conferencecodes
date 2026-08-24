import { createHash } from "crypto";
import type { NextRequest } from "next/server";

// Server-verifiable admin session, derived from ADMIN_PASSWORD. On successful
// /api/auth login we set an httpOnly cookie holding this token; admin-only
// endpoints (/api/admin/*) verify the cookie. This lets the admin UI trigger
// jobs and approve listings using the existing admin login, without exposing
// the password or the WORKER_SECRET in the browser.

export const ADMIN_COOKIE = "cc_admin";

export function adminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return createHash("sha256").update(`cc-admin:${pw}`).digest("hex");
}

// Returns null when authorized, or an error string when not.
export function checkAdminAuth(req: NextRequest): string | null {
  const expected = adminToken();
  if (!expected) return "ADMIN_PASSWORD is not configured on the server";
  const got = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!got) return "Not signed in as admin";
  if (got !== expected) return "Invalid admin session";
  return null;
}
