import { supabasePublic } from "@/lib/supabase";
import { NextResponse } from "next/server";

// Public API: returns only active and sold_out conferences
export async function GET() {
  const { data, error } = await supabasePublic
    .from("conferences")
    .select("*, pricing_tiers(*), hotels(*)")
    .in("status", ["active", "sold_out"])
    .order("start_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
