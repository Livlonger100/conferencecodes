import { FIRECRAWL_BASE_URL } from "./config";
import type { JobLogger } from "./log";
import { recordFirecrawlCall, getCachedPage, putCachedPage, type CallType } from "./firecrawl-store";

// Firecrawl client (v2). Renders JS automatically. JSON-schema extraction pulls
// structured pricing; the "links" format lets us find a pricing/tickets page
// when the given URL has no prices; "/map" lists a site's URLs as a fallback.
// The API key is read from env. Every Firecrawl call is logged via logger.spend()
// so credit use is visible.

export interface ScrapeResult {
  json: any | null;
  links: string[];
  markdown: string; // raw page text, used to ground extracted prices/dates
}

// One Firecrawl scrape. Always returns markdown (for grounding); optionally the
// page's links and a JSON extraction (schema + anti-fabrication prompt).
export async function firecrawlScrape(opts: {
  url: string;
  schema?: Record<string, unknown>;
  prompt?: string;
  proxy: "basic" | "stealth";
  withLinks?: boolean;
  callType?: CallType; // "scrape" (direct) or "finder" (candidate pricing page)
  forceRefresh?: boolean; // bypass the cache (admin Re-scrape)
  logger: JobLogger;
}): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");
  const callType: CallType = opts.callType ?? "scrape";

  // Cache reuse: a fresh cached fetch of this URL costs zero credits.
  if (!opts.forceRefresh) {
    const cached = await getCachedPage(opts.url);
    if (cached) {
      opts.logger.info("firecrawl.cache_hit", { url: opts.url, fetchedAt: cached.fetchedAt });
      await recordFirecrawlCall({ url: opts.url, callType, job: opts.logger.job, proxy: opts.proxy, ok: true, cached: true });
      return { json: cached.json, links: cached.links, markdown: cached.markdown };
    }
  }

  const formats: any[] = ["markdown"];
  if (opts.schema) formats.push({ type: "json", schema: opts.schema, ...(opts.prompt ? { prompt: opts.prompt } : {}) });
  if (opts.withLinks) formats.push("links");

  opts.logger.spend("firecrawl.scrape", { url: opts.url, proxy: opts.proxy, links: !!opts.withLinks, callType });

  try {
    const res = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url: opts.url, onlyMainContent: true, proxy: opts.proxy, formats, timeout: 60000 }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await res.json();
    if (!res.ok) {
      opts.logger.warn("firecrawl.error", { url: opts.url, status: res.status, error: data?.error });
      await recordFirecrawlCall({ url: opts.url, callType, job: opts.logger.job, proxy: opts.proxy, ok: false, cached: false });
      return { json: null, links: [], markdown: "" };
    }
    const d = data?.data ?? {};
    const rawLinks = Array.isArray(d.links) ? d.links : [];
    const links = rawLinks.map((l: any) => (typeof l === "string" ? l : l?.url)).filter(Boolean);
    const result: ScrapeResult = { json: d.json ?? d.extract ?? null, links, markdown: typeof d.markdown === "string" ? d.markdown : "" };
    await recordFirecrawlCall({ url: opts.url, callType, job: opts.logger.job, proxy: opts.proxy, ok: true, cached: false });
    await putCachedPage(opts.url, result);
    return result;
  } catch (e: any) {
    opts.logger.warn("firecrawl.threw", { url: opts.url, error: e?.message });
    await recordFirecrawlCall({ url: opts.url, callType, job: opts.logger.job, proxy: opts.proxy, ok: false, cached: false });
    return { json: null, links: [], markdown: "" };
  }
}

// List a site's URLs via Firecrawl /map (cheap way to find a pricing page).
export async function firecrawlMap(url: string, logger: JobLogger): Promise<string[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  logger.spend("firecrawl.map", { url });
  try {
    const res = await fetch(`${FIRECRAWL_BASE_URL}/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, limit: 150 }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await res.json();
    if (!res.ok) {
      logger.warn("firecrawl.map_error", { url, status: res.status, error: data?.error });
      await recordFirecrawlCall({ url, callType: "map", job: logger.job, proxy: "basic", ok: false, cached: false });
      return [];
    }
    const raw = Array.isArray(data?.links) ? data.links : Array.isArray(data?.data?.links) ? data.data.links : [];
    await recordFirecrawlCall({ url, callType: "map", job: logger.job, proxy: "basic", ok: true, cached: false });
    return raw.map((l: any) => (typeof l === "string" ? l : l?.url)).filter(Boolean);
  } catch (e: any) {
    logger.warn("firecrawl.map_threw", { url, error: e?.message });
    await recordFirecrawlCall({ url, callType: "map", job: logger.job, proxy: "basic", ok: false, cached: false });
    return [];
  }
}
