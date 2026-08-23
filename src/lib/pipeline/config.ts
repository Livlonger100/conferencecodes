// ============================================================
// ConferenceCodes discovery + ingestion pipeline — CONFIG
// Everything you are likely to tune lives here.
// ============================================================

// Claude model used for discovery search sweeps and Tier 1 parsing.
// Matches the model the existing /api/extract route uses. Bump when ready.
export const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

// How many APPROVED candidates the ingestion worker processes per invocation.
// Keep this small so a single serverless call never approaches the Vercel
// function timeout (~60s hobby / ~300s pro). Cron ticks repeatedly to drain
// the queue. Tune up only if you are on Pro and each item is fast.
export const INGEST_BATCH_SIZE = 3;

// Discovery processes at most this many sources per invocation, then returns.
// Sources rotate across runs (offset stored in pipeline_state) so the whole
// list is covered over time without any single run timing out.
export const DISCOVERY_SOURCES_PER_RUN = 4;

// When true, freshly discovered candidates are auto-approved (skips the manual
// gate). Leave false until you trust discovery quality.
export const AUTO_APPROVE = false;

// Status the conference row is given on a successful ingest. Ingested output is
// meant to go live, so this defaults to "active". Set to "draft" if you want a
// second human check before it appears on the site.
export const INGEST_PUBLISH_STATUS = "active";

// When an ingest is flagged "likely incomplete", hold it as a draft (not public)
// instead of publishing it as trusted. Set false to publish anyway with the
// honest public-page note below.
export const HOLD_INCOMPLETE_AS_DRAFT = true;

// A published conference whose confidence is below this shows an honest
// "pricing may be incomplete" note on its public detail page.
export const PUBLIC_PRICING_NOTE_BELOW = 0.6;

// Firecrawl endpoint + cost controls. The API key is read from env at call time
// (FIRECRAWL_API_KEY) and is never stored here.
export const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v2";
// Cheap attempt first (basic proxy). Only escalate to stealth (more credits)
// when the cheap attempt returns no usable pricing.
export const FIRECRAWL_ESCALATE_TO_STEALTH = true;

// Every candidate/conference is tagged with this category. 3C is AI-only.
export const PIPELINE_CATEGORY = "AI / Tech";

// ------------------------------------------------------------
// DISCOVERY SOURCES
// Edit this array freely. Two kinds:
//   { kind: "search",    query, region }  -> Claude web_search sweep
//   { kind: "directory", url,   region }  -> Claude reads/lists an aggregator
// Discovery output is candidates only (no pricing). It is allowed to be sloppy;
// the approval gate catches mistakes.
// ------------------------------------------------------------
export type DiscoverySource =
  | { kind: "search"; label: string; query: string; region: string }
  | { kind: "directory"; label: string; url: string; region: string };

// Rolling discovery window: from today through this many months out. Nothing is
// hardcoded to a calendar year, so the job keeps working as time passes.
export const DISCOVERY_WINDOW_MONTHS = 18;

// The window as UTC dates: start = today (midnight), end = start + N months.
export function discoveryWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + DISCOVERY_WINDOW_MONTHS);
  return { start, end };
}

// Space-separated list of every calendar year the window touches, e.g. "2026 2027"
// (or three years when the window straddles a further boundary). Interpolated into
// the search queries so results surface upcoming events across the whole window.
export function discoveryYearsPhrase(now: Date = new Date()): string {
  const { start, end } = discoveryWindow(now);
  const years: number[] = [];
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) years.push(y);
  return years.join(" ");
}

// Search queries interpolate the current window's year(s) at runtime. Regions and
// source structure are unchanged; only the date/year logic is dynamic now.
export function getDiscoverySources(now: Date = new Date()): DiscoverySource[] {
  const YEARS = discoveryYearsPhrase(now);
  return [
    { kind: "search", label: "AI conf North America", query: `major AI conferences ${YEARS}`, region: "North America" },
    { kind: "search", label: "AI conf Europe", query: `AI and machine learning conferences ${YEARS} Europe`, region: "Europe" },
    { kind: "search", label: "AI conf Asia", query: `artificial intelligence conferences ${YEARS} Asia Singapore Japan India`, region: "Asia" },
    { kind: "search", label: "AI conf Middle East + Africa", query: `AI summit ${YEARS} Dubai Riyadh Africa`, region: "Middle East / Africa" },
    { kind: "search", label: "Generative / agentic AI", query: `generative AI and AI agents conference ${YEARS} worldwide`, region: "Global" },
    { kind: "search", label: "MLOps / applied AI", query: `MLOps and applied machine learning conference ${YEARS}`, region: "Global" },
    { kind: "directory", label: "tryolabs directory", url: "https://tryolabs.com/blog/machine-learning-deep-learning-conferences", region: "Global" },
    { kind: "directory", label: "aiconferences.info", url: "https://aiconferences.info", region: "Global" },
  ];
}

// ------------------------------------------------------------
// RECRAWL CADENCE
// How far in the future to schedule the next recrawl, based on proximity to the
// event and to the nearest known deadline. Returned value is a number of days.
// ------------------------------------------------------------
export function nextRecrawlDays(opts: {
  daysUntilEvent: number | null;
  daysUntilNearestDeadline: number | null;
}): number {
  const candidates: number[] = [];
  const push = (proximityDays: number | null) => {
    if (proximityDays == null) return;
    if (proximityDays < 0) return; // already passed
    if (proximityDays <= 14) candidates.push(1); // within 2 weeks -> daily
    else if (proximityDays <= 45) candidates.push(3); // within ~6 weeks -> every 3 days
    else if (proximityDays <= 120) candidates.push(7); // within 4 months -> weekly
    else candidates.push(30); // far out -> monthly
  };
  push(opts.daysUntilEvent);
  push(opts.daysUntilNearestDeadline);
  if (candidates.length === 0) return 30; // event passed / unknown -> monthly
  return Math.min(...candidates); // tighten to the nearest pressure point
}
