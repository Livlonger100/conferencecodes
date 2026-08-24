import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminAuth } from "@/lib/admin-auth";

// Admin review API for pipeline-ingested DRAFT conferences. Admin-cookie
// protected. GET lists them with captured data + tiers + candidate metadata;
// PATCH saves inline edits and either approves (publish -> active) or keeps draft.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toIsoDateOrNull(d: string | null | undefined): string | null {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  // Candidates that produced a conference (pipeline-origin), with their metadata.
  const { data: cands } = await supabaseAdmin
    .from("discovery_queue")
    .select("id, conference_id, tier_used, notes, url, source, status")
    .not("conference_id", "is", null);

  const byConf = new Map<string, any>();
  for (const c of cands ?? []) byConf.set(c.conference_id, c);
  const ids = [...byConf.keys()];
  if (ids.length === 0) return NextResponse.json({ conferences: [] });

  const { data: confs, error } = await supabaseAdmin
    .from("conferences")
    .select("*, pricing_tiers(*)")
    .eq("status", "draft")
    .in("id", ids)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const conferences = (confs ?? []).map((c: any) => {
    const cand = byConf.get(c.id);
    return {
      ...c,
      pricing_tiers: (c.pricing_tiers || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)),
      candidate: cand
        ? { id: cand.id, tier_used: cand.tier_used, notes: cand.notes, url: cand.url, source: cand.source }
        : null,
    };
  });

  return NextResponse.json({ conferences });
}

export async function PATCH(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const body = await req.json();
  const { id, action, pricing } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (action !== "approve" && action !== "draft") {
    return NextResponse.json({ error: "action must be approve or draft" }, { status: 400 });
  }

  const confUpdate: Record<string, unknown> = {
    name: body.name,
    description: body.description,
    city: body.city,
    country: body.country,
    start_date: toIsoDateOrNull(body.start_date),
    end_date: toIsoDateOrNull(body.end_date),
    source_url: body.source_url,
    registration_url: body.registration_url || body.source_url,
    status: action === "approve" ? "active" : "draft",
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabaseAdmin.from("conferences").update(confUpdate).eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Replace pricing tiers with the edited set (includes early-bird window).
  if (Array.isArray(pricing)) {
    await supabaseAdmin.from("pricing_tiers").delete().eq("conference_id", id);
    const rows = pricing.map((t: any, i: number) => ({
      conference_id: id,
      tier_name: t.tier_name || "",
      price: t.price === "" || t.price == null ? null : Number(t.price),
      currency: t.currency || "USD",
      deadline: toIsoDateOrNull(t.deadline),
      early_bird_start: toIsoDateOrNull(t.early_bird_start),
      early_bird_end: toIsoDateOrNull(t.early_bird_end),
      is_early_bird: !!t.is_early_bird,
      sort_order: i,
      notes: t.notes || "",
    }));
    if (rows.length > 0) {
      const { error: tErr } = await supabaseAdmin.from("pricing_tiers").insert(rows);
      if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, status: confUpdate.status });
}
