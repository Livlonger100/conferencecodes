import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { url, email } = await req.json();

  if (!url || !url.trim()) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("submissions")
    .insert({ url: url.trim(), email: email?.trim() || null });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
