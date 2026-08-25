import { FIRECRAWL_BASE_URL } from "./config";
import type { JobLogger } from "./log";

// Firecrawl client (v2). Renders JS automatically. JSON-schema extraction pulls
// structured pricing; the "links" format lets us find a pricing/tickets page
// when the given URL has no prices; "/map" lists a site's URLs as a fallback.
// The API key is read from env. Every Firecrawl call is logged via logger.spend()
// so credit use is visible.

export interface ScrapeResult {
  json: any | null;
  links: string[];
}

// One Firecrawl scrape. Optionally also returns the page's links.
export async function firecrawlScrape(opts: {
  url: string;
  schema?: Record<string, unknown>;
  proxy: "basic" | "stealth";
  withLinks?: boolean;
  logger: JobLogger;
}): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  const formats: any[] = [];
  if (opts.schema) formats.push({ type: "json", schema: opts.schema });
  if (opts.withLinks) formats.push("links");

  opts.logger.spend("firecrawl.scrape", { url: opts.url, proxy: opts.proxy, links: !!opts.withLinks });

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
      return { json: null, links: [] };
    }
    const d = data?.data ?? {};
    const rawLinks = Array.isArray(d.links) ? d.links : [];
    const links = rawLinks.map((l: any) => (typeof l === "string" ? l : l?.url)).filter(Boolean);
    return { json: d.json ?? d.extract ?? null, links };
  } catch (e: any) {
    opts.logger.warn("firecrawl.threw", { url: opts.url, error: e?.message });
    return { json: null, links: [] };
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
      return [];
    }
    const raw = Array.isArray(data?.links) ? data.links : Array.isArray(data?.data?.links) ? data.data.links : [];
    return raw.map((l: any) => (typeof l === "string" ? l : l?.url)).filter(Boolean);
  } catch (e: any) {
    logger.warn("firecrawl.map_threw", { url, error: e?.message });
    return [];
  }
}
