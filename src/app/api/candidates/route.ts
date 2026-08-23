import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// Admin API for the approval gate. Follows the same trust model as the existing
// /api/conferences admin routes (guarded by the client-side admin password gate,
// not a server session). List candidates and approve/reject them (single or bulk).

export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get("status") || "discovered";

  const query = supabaseAdmin
    .from("discovery_queue")
    .select("*")
    .order("created_at", { ascending: false });

  const { data, error } =
    status === "all" ? await query : await query.eq("status", status);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Status counts for the admin header.
  const { data: allRows } = await supabaseAdmin.from("discovery_queue").select("status");
  const counts: Record<string, number> = {};
  for (const r of allRows ?? []) counts[r.status] = (counts[r.status] || 0) + 1;

  return NextResponse.json({ candidates: data, counts });
}

export async function PATCH(req: NextRequest) {
  const { ids, action } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }
  const status = action === "approve" ? "approved" : "rejected";

  const { error, count } = await supabaseAdmin
    .from("discovery_queue")
    .update({ status, updated_at: new Date().toISOString() }, { count: "exact" })
    .in("id", ids)
    .eq("status", "discovered"); // only act on still-pending candidates

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: count ?? 0, status });
}
