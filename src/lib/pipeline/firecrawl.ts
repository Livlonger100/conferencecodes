import { FIRECRAWL_BASE_URL } from "./config";
import type { JobLogger } from "./log";

// Firecrawl scrape client. Firecrawl renders JavaScript automatically, which is
// why we use it for JS-heavy pricing pages. We use the v2 scrape endpoint with
// JSON-schema extraction ("json" format). The API key is read from env.
//
// Cost awareness: JSON extraction and stealth proxy cost more credits. We do a
// cheap attempt first (basic proxy) and only escalate to stealth if the cheap
// attempt returns no usable data. Every scrape is logged via logger.spend().

interface ScrapeResult {
  json: any | null;
  proxyUsed: "basic" | "stealth";
  raw?: any;
}

async function scrapeOnce(opts: {
  url: string;
  schema: Record<string, unknown>;
  proxy: "basic" | "stealth";
  logger: JobLogger;
}): Promise<any | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  opts.logger.spend("firecrawl.scrape", { url: opts.url, proxy: opts.proxy, format: "json" });

  const res = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url: opts.url,
      onlyMainContent: true,
      proxy: opts.proxy,
      formats: [
        {
          type: "json",
          schema: opts.schema,
        },
      ],
      timeout: 60000,
    }),
    signal: AbortSignal.timeout(90000),
  });

  const data = await res.json();
  if (!res.ok) {
    opts.logger.warn("firecrawl.error", { status: res.status, error: data?.error });
    return null;
  }
  // v2 returns extracted structured data under data.json (schema mode).
  return data?.data?.json ?? data?.data?.extract ?? null;
}

// Returns extracted JSON, escalating to stealth only if the cheap attempt gave
// nothing useful. `hasUsableData` decides whether escalation is needed.
export async function firecrawlExtract(opts: {
  url: string;
  schema: Record<string, unknown>;
  logger: JobLogger;
  escalateToStealth: boolean;
  hasUsableData: (json: any) => boolean;
}): Promise<ScrapeResult> {
  const cheap = await scrapeOnce({ url: opts.url, schema: opts.schema, proxy: "basic", logger: opts.logger });
  if (opts.hasUsableData(cheap)) {
    return { json: cheap, proxyUsed: "basic" };
  }
  if (!opts.escalateToStealth) {
    return { json: cheap, proxyUsed: "basic" };
  }
  opts.logger.info("firecrawl.escalate", { url: opts.url, reason: "no usable pricing on basic proxy" });
  const stealth = await scrapeOnce({ url: opts.url, schema: opts.schema, proxy: "stealth", logger: opts.logger });
  return { json: stealth ?? cheap, proxyUsed: "stealth" };
}
