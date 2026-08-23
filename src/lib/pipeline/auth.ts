import { NextRequest } from "next/server";

// Guards the worker endpoints (/api/jobs/*) so they cannot be triggered
// publicly. The secret is read from env (WORKER_SECRET) and accepted from any
// of: `x-worker-secret` header, `Authorization: Bearer <secret>`, or `?secret=`.
// pg_cron sends it as a header; manual curl / admin buttons can use any form.
//
// Returns null when authorized, or an error string when not.
export function checkWorkerAuth(req: NextRequest): string | null {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return "WORKER_SECRET is not configured on the server";

  const header = req.headers.get("x-worker-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const query = new URL(req.url).searchParams.get("secret");
  const provided = header || bearer || query;

  if (!provided) return "Missing worker secret";
  if (provided !== secret) return "Invalid worker secret";
  return null;
}
