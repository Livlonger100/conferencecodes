import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { runExtraction } from "@/lib/pipeline/ingest";
import { JobLogger } from "@/lib/pipeline/log";
import { PIPELINE_CATEGORY } from "@/lib/pipeline/config";

// Add New extraction. Single route from URL to grounded pricing, shared with
// Scrape / Bulk Import / Re-scrape: Firecrawl fetch, shared extraction prompt,
// shared grounding gate, and the pricing-page finder fallback. No naive fetch,
// no web_search: extraction operates only on the fetched page text.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  const logger = new JobLogger("admin-extract");
  try {
    const result = await runExtraction(url.trim(), logger);
    const base = result.base ?? null;
    const pricing = (base?.pricing_tiers ?? []).map((t) => ({
      tier: t.name,
      price: t.price,
      price_after_deadline: t.price_after_deadline ?? null,
      currency: t.currency || "USD",
      deadline: t.deadline || null,
      deadline_passed: false,
      days_included: "all",
      requires_approval: false,
      notes: "",
    }));
    return NextResponse.json({
      ok: result.ok,
      errors: result.errors,
      groundingNote: result.meta.groundingNote || "",
      pricingUrl: result.meta.pricingUrl || null,
      base: {
        name: base?.title || "",
        description: base?.description || "",
        city: base?.city || "",
        country: base?.country || "",
        start: base?.start_date || "",
        end: base?.end_date || "",
        official_url: base?.official_url || url.trim(),
        category: PIPELINE_CATEGORY,
      },
      pricing,
    });
  } catch (e: any) {
    logger.error("admin_extract.fatal", { error: e?.message });
    return NextResponse.json({ error: e?.message || "extraction failed" }, { status: 500 });
  }
}
