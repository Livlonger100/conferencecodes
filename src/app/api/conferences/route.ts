import { supabaseAdmin } from "@/lib/supabase";
import { makeSlug } from "@/lib/slug";
import { NextRequest, NextResponse } from "next/server";

// Ensure a generated slug is unique (append numeric suffix on collision).
async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let n = 2; n <= 50; n++) {
    const { data } = await supabaseAdmin.from("conferences").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

// GET all conferences with pricing tiers and hotels
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("conferences")
    .select("*, pricing_tiers(*), hotels(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST create a new conference
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id: _id, pricing, hotels, ...conf } = body;

  // Generate a clean slug in the app unless one was supplied.
  if (!conf.slug && conf.name) {
    conf.slug = await ensureUniqueSlug(makeSlug(conf.name, conf.start_date));
  }

  // Insert conference
  const { data: created, error } = await supabaseAdmin
    .from("conferences")
    .insert(conf)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert pricing tiers
  if (pricing?.length > 0) {
    const tiers = pricing.map((t: any, i: number) => ({
      conference_id: created.id,
      tier_name: t.tier_name || "",
      price: t.price,
      price_after_deadline: t.price_after_deadline || null,
      currency: t.currency || "USD",
      deadline: t.deadline || null,
      early_bird_start: t.early_bird_start || null,
      early_bird_end: t.early_bird_end || null,
      days_included: t.days_included || "",
      notes: t.notes || "",
      deadline_passed: t.deadline_passed || false,
      requires_approval: t.requires_approval || false,
      sold_out: t.sold_out || false,
      is_early_bird: t.is_early_bird || false,
      sort_order: i,
    }));
    const { error: tierErr } = await supabaseAdmin.from("pricing_tiers").insert(tiers);
    if (tierErr) return NextResponse.json({ error: `pricing tiers insert failed: ${tierErr.message}` }, { status: 500 });
  }

  // Insert hotels
  if (hotels?.length > 0) {
    const h = hotels.map((hotel: any) => ({
      conference_id: created.id,
      name: hotel.name || "",
      stars: hotel.stars || 3,
      conf_rate: hotel.conf_rate || null,
      rack_rate: hotel.rack_rate || null,
      book_by: hotel.book_by || null,
      distance: hotel.distance || "",
      url: hotel.url || "",
    }));
    await supabaseAdmin.from("hotels").insert(h);
  }

  // Return created conference with relations
  const { data: full } = await supabaseAdmin
    .from("conferences")
    .select("*, pricing_tiers(*), hotels(*)")
    .eq("id", created.id)
    .single();

  return NextResponse.json(full, { status: 201 });
}

// PATCH update a conference
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, pricing, hotels, ...conf } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Update conference
  const { error } = await supabaseAdmin
    .from("conferences")
    .update(conf)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Replace pricing tiers
  await supabaseAdmin.from("pricing_tiers").delete().eq("conference_id", id);
  if (pricing?.length > 0) {
    const tiers = pricing.map((t: any, i: number) => ({
      conference_id: id,
      tier_name: t.tier_name || "",
      price: t.price,
      price_after_deadline: t.price_after_deadline || null,
      currency: t.currency || "USD",
      deadline: t.deadline || null,
      early_bird_start: t.early_bird_start || null,
      early_bird_end: t.early_bird_end || null,
      days_included: t.days_included || "",
      notes: t.notes || "",
      deadline_passed: t.deadline_passed || false,
      requires_approval: t.requires_approval || false,
      sold_out: t.sold_out || false,
      is_early_bird: t.is_early_bird || false,
      sort_order: i,
    }));
    const { error: tierErr } = await supabaseAdmin.from("pricing_tiers").insert(tiers);
    if (tierErr) return NextResponse.json({ error: `pricing tiers insert failed: ${tierErr.message}` }, { status: 500 });
  }

  // Replace hotels
  await supabaseAdmin.from("hotels").delete().eq("conference_id", id);
  if (hotels?.length > 0) {
    const h = hotels.map((hotel: any) => ({
      conference_id: id,
      name: hotel.name || "",
      stars: hotel.stars || 3,
      conf_rate: hotel.conf_rate || null,
      rack_rate: hotel.rack_rate || null,
      book_by: hotel.book_by || null,
      distance: hotel.distance || "",
      url: hotel.url || "",
    }));
    await supabaseAdmin.from("hotels").insert(h);
  }

  // Return updated conference
  const { data: full } = await supabaseAdmin
    .from("conferences")
    .select("*, pricing_tiers(*), hotels(*)")
    .eq("id", id)
    .single();

  return NextResponse.json(full);
}

// DELETE a conference
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("conferences")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
