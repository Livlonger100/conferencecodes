import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ error: "ADMIN_PASSWORD not configured" }, { status: 500 });
  }

  if (password === adminPassword) {
    // Set a server-verifiable admin cookie so admin-only endpoints work off the
    // existing login (no need to re-enter the worker secret in the UI).
    const res = NextResponse.json({ ok: true });
    const token = adminToken();
    if (token) {
      res.cookies.set(ADMIN_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
    }
    return res;
  }

  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}
