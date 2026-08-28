import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// Admin API for the approval gate. Follows the same trust model as the existing
// /api/conferences admin routes (guarded by the client-side admin password gate,
// not a server session). List candidates and approve/reject them (single or bulk).

export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get("status") || "discovered";

  const { data: rows, error } = await supabaseAdmin
    .from("discovery_queue")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // "Published" is derived from the linked conference's live status, so a
  // drafted candidate moves out of the Drafted tab the moment its conference is
  // published (active/sold_out) and back if it is unpublished. No stored state
  // to keep in sync; the candidate row and its notes are never modified.
  const { data: confs } = await supabaseAdmin.from("conferences").select("id, status");
  const publishedIds = new Set((confs ?? []).filter((c) => c.status === "active" || c.status === "sold_out").map((c) => c.id));
  const effective = (c: any) =>
    c.status === "ingested" && c.conference_id && publishedIds.has(c.conference_id) ? "published" : c.status;

  const counts: Record<string, number> = {};
  const annotated = (rows ?? []).map((r) => ({ ...r, effective_status: effective(r) }));
  for (const r of annotated) counts[r.effective_status] = (counts[r.effective_status] || 0) + 1;

  const candidates = status === "all" ? annotated : annotated.filter((r) => r.effective_status === status);
  return NextResponse.json({ candidates, counts });
}

export async function PATCH(req: NextRequest) {
  const { ids, action } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }
  if (!["queue", "reject", "rescrape", "restore"].includes(action)) {
    return NextResponse.json({ error: "action must be queue, reject, rescrape, or restore" }, { status: 400 });
  }

  // restore: bring a rejected candidate back. If it has a conference (an
  // auto-rejected academic draft), flip that conference back to draft and the
  // candidate to Drafted; otherwise return it to the Discovered queue.
  if (action === "restore") {
    const { data: rows, error: fErr } = await supabaseAdmin
      .from("discovery_queue")
      .select("id, conference_id")
      .in("id", ids)
      .eq("status", "rejected");
    if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
    const stamp = new Date().toISOString();
    let restored = 0;
    for (const r of rows ?? []) {
      const hasConf = !!(r as any).conference_id;
      if (hasConf) {
        await supabaseAdmin.from("conferences").update({ status: "draft", updated_at: stamp }).eq("id", (r as any).conference_id);
      }
      await supabaseAdmin.from("discovery_queue").update({ status: hasConf ? "ingested" : "discovered", notes: null, updated_at: stamp }).eq("id", (r as any).id);
      restored++;
    }
    return NextResponse.json({ ok: true, updated: restored, status: "restored" });
  }

  // queue: move discovered candidates into the internal scrape queue.
  // reject: discard discovered candidates.
  // rescrape: re-queue already-drafted or failed candidates to be scraped again
  // (writeConference dedupes by source URL, so the existing draft is replaced).
  const fromStatuses = action === "rescrape" ? ["ingested", "failed"] : ["discovered"];
  const toStatus = action === "reject" ? "rejected" : "approved";
  const patch: Record<string, unknown> = { status: toStatus, updated_at: new Date().toISOString() };
  if (action === "rescrape") { patch.notes = null; patch.tier_used = null; }

  const { error, count } = await supabaseAdmin
    .from("discovery_queue")
    .update(patch, { count: "exact" })
    .in("id", ids)
    .in("status", fromStatuses);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: count ?? 0, status: toStatus });
}
