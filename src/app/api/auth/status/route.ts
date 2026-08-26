import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";

// Reports whether the current request carries a valid admin session cookie, so
// the admin UI can show real auth state on load instead of trusting a stale
// client flag. Never cached.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const error = checkAdminAuth(req);
  return NextResponse.json({ authed: error === null, error }, { headers: { "Cache-Control": "no-store" } });
}
