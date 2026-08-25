import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminAuth } from "@/lib/admin-auth";

// Admin CRUD for editable discovery sources (discovery_sources table).
// Admin-cookie protected. The discovery job reads enabled rows from this table
// and falls back to config defaults if the table is empty.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("discovery_sources")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data ?? [] });
}

export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });
  const b = await req.json();
  const row = {
    kind: b.kind === "directory" ? "directory" : "search",
    label: (b.label || "").trim() || "Untitled source",
    query: b.query?.trim() || null,
    url: b.url?.trim() || null,
    region: b.region?.trim() || "Global",
    enabled: b.enabled !== false,
    sort_order: Number.isFinite(b.sort_order) ? b.sort_order : 100,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin.from("discovery_sources").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, source: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ["kind", "label", "query", "url", "region", "enabled", "sort_order"]) {
    if (f in b) patch[f] = b[f];
  }
  const { error } = await supabaseAdmin.from("discovery_sources").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabaseAdmin.from("discovery_sources").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
