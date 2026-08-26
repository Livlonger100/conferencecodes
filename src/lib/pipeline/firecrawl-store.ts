import { supabaseAdmin } from "@/lib/supabase";
import { FIRECRAWL_CACHE_DAYS } from "./config";

// Firecrawl instrumentation + raw-page-text cache. Both are best-effort: any
// failure here is swallowed so it can never break an extraction. Usage is kept
// as a single aggregate row in pipeline_state (no migration needed). The cache
// uses the firecrawl_cache table (migration 0004); when that table is absent the
// cache simply misses and every fetch goes live.

const USAGE_KEY = "firecrawl_usage";
export const CACHE_FRESHNESS_MS = FIRECRAWL_CACHE_DAYS * 24 * 60 * 60 * 1000;

export type CallType = "scrape" | "finder" | "map";

// Which pipeline made the call, derived from the JobLogger name.
export function sourceFromJob(job: string): string {
  if (job === "admin-extract") return "Add New";
  if (job === "admin-ingest") return "Scrape/Re-scrape/Bulk";
  if (job === "ingest") return "Ingest (cron)";
  if (/discover/.test(job)) return "Discovery";
  if (job === "regression") return "Regression";
  return job || "unknown";
}

// Rough Firecrawl credit cost: basic scrape 1, stealth 5, map 2.
export function creditsFor(callType: CallType, proxy: string): number {
  if (callType === "map") return 2;
  return proxy === "stealth" ? 5 : 1;
}

interface Usage {
  totalCalls: number; totalCredits: number;
  month: string; monthCalls: number; monthCredits: number;
  failures: number; cacheHits: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
  recent: { ts: string; url: string; callType: string; source: string; ok: boolean; cached: boolean; credits: number }[];
}
function fresh(month: string): Usage {
  return { totalCalls: 0, totalCredits: 0, month, monthCalls: 0, monthCredits: 0, failures: 0, cacheHits: 0, byType: {}, bySource: {}, recent: [] };
}

export async function recordFirecrawlCall(opts: {
  url: string; callType: CallType; job: string; proxy: string; ok: boolean; cached: boolean;
}): Promise<void> {
  try {
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const source = sourceFromJob(opts.job);
    const credits = opts.cached ? 0 : opts.ok ? creditsFor(opts.callType, opts.proxy) : 0;

    const { data } = await supabaseAdmin.from("pipeline_state").select("value").eq("key", USAGE_KEY).maybeSingle();
    const u: Usage = (data?.value as Usage) || fresh(month);
    if (u.month !== month) { u.month = month; u.monthCalls = 0; u.monthCredits = 0; }

    if (opts.cached) {
      u.cacheHits = (u.cacheHits || 0) + 1;
    } else {
      u.totalCalls = (u.totalCalls || 0) + 1;
      u.monthCalls = (u.monthCalls || 0) + 1;
      u.totalCredits = (u.totalCredits || 0) + credits;
      u.monthCredits = (u.monthCredits || 0) + credits;
      u.byType[opts.callType] = (u.byType[opts.callType] || 0) + 1;
      u.bySource[source] = (u.bySource[source] || 0) + 1;
      if (!opts.ok) u.failures = (u.failures || 0) + 1;
    }
    u.recent = [{ ts: now.toISOString(), url: opts.url, callType: opts.callType, source, ok: opts.ok, cached: opts.cached, credits }, ...(u.recent || [])].slice(0, 100);

    await supabaseAdmin.from("pipeline_state").upsert({ key: USAGE_KEY, value: u, updated_at: now.toISOString() }, { onConflict: "key" });
  } catch (e) {
    // instrumentation must never break a scrape
  }
}

export interface CachedPage { json: any | null; links: string[]; markdown: string; fetchedAt: string }

export async function getCachedPage(url: string): Promise<CachedPage | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("firecrawl_cache")
      .select("markdown, json, links, fetched_at")
      .eq("url", url)
      .maybeSingle();
    if (error || !data || !data.markdown) return null;
    if (Date.now() - Date.parse(data.fetched_at) > CACHE_FRESHNESS_MS) return null; // stale
    return { json: data.json ?? null, links: Array.isArray(data.links) ? data.links : [], markdown: data.markdown, fetchedAt: data.fetched_at };
  } catch (e) {
    return null; // table missing or unreachable -> cache miss
  }
}

export async function putCachedPage(url: string, page: { json: any | null; links: string[]; markdown: string }): Promise<void> {
  try {
    if (!page.markdown) return;
    await supabaseAdmin
      .from("firecrawl_cache")
      .upsert({ url, markdown: page.markdown, json: page.json ?? null, links: page.links ?? [], fetched_at: new Date().toISOString() }, { onConflict: "url" });
  } catch (e) {
    // cache write is best-effort
  }
}
