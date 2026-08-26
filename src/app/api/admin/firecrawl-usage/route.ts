import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { FIRECRAWL_CACHE_DAYS } from "@/lib/pipeline/config";

// Firecrawl usage totals for the admin (from the pipeline_state aggregate the
// firecrawl client updates on every call). Read-only, admin-authenticated.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { data } = await supabaseAdmin.from("pipeline_state").select("value").eq("key", "firecrawl_usage").maybeSingle();
  const usage = (data?.value as any) || {
    totalCalls: 0, totalCredits: 0, month: new Date().toISOString().slice(0, 7), monthCalls: 0, monthCredits: 0,
    failures: 0, cacheHits: 0, byType: {}, bySource: {}, recent: [],
  };
  return NextResponse.json({ usage, cacheDays: FIRECRAWL_CACHE_DAYS, freeTierCredits: 1000 });
}
