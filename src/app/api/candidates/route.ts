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
  if (!["approve", "reject", "retry"].includes(action)) {
    return NextResponse.json({ error: "action must be approve, reject, or retry" }, { status: 400 });
  }

  // approve/reject act on still-pending (discovered) rows; retry re-queues
  // failed rows back to approved (clearing the old failure note) so ingestion
  // picks them up again.
  const fromStatus = action === "retry" ? "failed" : "discovered";
  const toStatus = action === "reject" ? "rejected" : "approved";
  const patch: Record<string, unknown> = { status: toStatus, updated_at: new Date().toISOString() };
  if (action === "retry") { patch.notes = null; patch.tier_used = null; }

  const { error, count } = await supabaseAdmin
    .from("discovery_queue")
    .update(patch, { count: "exact" })
    .in("id", ids)
    .eq("status", fromStatus);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: count ?? 0, status: toStatus });
}
