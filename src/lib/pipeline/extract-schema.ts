import type { ExtractedConference, ExtractedTier } from "./types";

// The structured shape we want from every ingestion attempt. Used both as the
// Firecrawl JSON schema and to steer the Claude Tier 1 parser. Deliberately
// EXCLUDES speakers, topics, and hotels.
export const EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string", description: "Official conference name" },
    description: { type: "string", description: "2-3 sentence description" },
    city: { type: "string" },
    country: { type: "string" },
    official_url: { type: "string", description: "Official conference website URL" },
    start_date: { type: "string", description: "YYYY-MM-DD" },
    end_date: { type: "string", description: "YYYY-MM-DD" },
    pricing_tiers: {
      type: "array",
      description:
        "The actual purchasable passes/tickets a buyer selects, using their exact names as shown on the page (e.g. Startups Pass, All Access Pass, VIP Pass, Investors, Media). Only include tiers, names and prices that literally appear on the page. Capture free passes (price 0) when the page says Free. Do NOT output a price-increase timeline or rate-escalation schedule (rows like 'Early Rate', 'Standard Rate', 'Advance Rate', 'Late Rate', 'Final Rate' under a 'Registration Timeline') as separate tickets; those describe how ONE pass's price rises over time, not distinct products. Never invent or estimate prices, names, or dates. If a single ticket type genuinely shows several prices across registration periods, output one item per period using the exact same name for each, with that period's price and its deadline; do not merge or average them.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exact pass/ticket name from the page" },
          price: { type: ["number", "null"], description: "Numeric amount that literally appears on the page, or null if no price is shown. Never estimate." },
          currency: { type: "string", description: "ISO 4217 code, e.g. USD, EUR, GBP" },
          is_early_bird: { type: "boolean" },
          early_bird_start: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
          early_bird_end: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
          deadline: { type: ["string", "null"], description: "The date this price or registration period ends (when the price changes), YYYY-MM-DD or null" },
        },
      },
    },
  },
  required: ["title"],
};

// Sent to Firecrawl's JSON extraction alongside the schema. The schema alone does
// not carry a do-not-invent instruction, so this makes it explicit.
export const EXTRACTION_JSON_PROMPT =
  "Extract the actual purchasable passes/tickets a buyer would select, using their exact names as shown on the page. Only include names and prices that literally appear on the page text. Capture free passes as price 0 when the page says Free. Do NOT treat a price-increase timeline or rate-escalation schedule (rows like Early Rate, Standard Rate, Advance Rate, Late Rate, Final Rate under a Registration Timeline) as separate tickets; that describes how one pass's price rises over time, not distinct products. If no ticket prices are shown, return an empty pricing_tiers array. Never invent, estimate, or guess prices, tier names, or dates. If a single ticket type genuinely shows several prices across registration periods, return one entry per period using the exact same tier name for each, with that period's price and set deadline to the date that period ends. Do not average or merge them.";

export const EXTRACTION_SYSTEM = `You extract conference data for ConferenceCodes (AI conferences only).
Return ONLY valid JSON matching the requested schema. No markdown, no prose.

Rules:
- Extract ONLY what is explicitly on the page. Never invent tiers or prices.
- Use the exact tier name shown. Include expired/early-bird tiers if visible.
- price must be a number with no currency symbol, or null if not shown.
- currency must be an ISO 4217 code (USD, EUR, GBP, ...). Infer from the symbol.
- Dates must be YYYY-MM-DD. Only the next upcoming edition, not past editions.
- Do NOT extract speakers, topics, tags, or hotels.
- official_url is the main conference website.`;

// ---- normalization + validation -------------------------------------------

const SYMBOL_TO_ISO: Record<string, string> = {
  "$": "USD", "US$": "USD", "usd": "USD",
  "€": "EUR", "eur": "EUR",
  "£": "GBP", "gbp": "GBP",
  "¥": "JPY", "jpy": "JPY",
  "₹": "INR", "inr": "INR",
  "a$": "AUD", "c$": "CAD", "s$": "SGD", "chf": "CHF",
};

export function resolveCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  const key = trimmed.toLowerCase();
  return SYMBOL_TO_ISO[key] || SYMBOL_TO_ISO[trimmed] || null;
}

function isSaneDate(d: string | null): boolean {
  if (!d) return true; // null is allowed for optional deadline fields
  const t = Date.parse(d);
  if (Number.isNaN(t)) return false;
  const year = new Date(t).getUTCFullYear();
  return year >= 2024 && year <= 2032;
}

// Keep a tier date only if it is a sane, in-range date; otherwise drop it to
// null. A malformed or out-of-range tier date must not fail the whole conference.
function saneTierDate(d: any): string | null {
  if (!d) return null;
  const s = String(d);
  return isSaneDate(s) ? s : null;
}

// Coerce a loose extracted object into our ExtractedConference shape.
export function normalizeExtraction(raw: any): ExtractedConference | null {
  if (!raw || typeof raw !== "object") return null;
  const tiersRaw = Array.isArray(raw.pricing_tiers) ? raw.pricing_tiers : [];
  const tiers: ExtractedTier[] = tiersRaw.map((t: any) => ({
    name: String(t?.name ?? "").trim() || "Standard",
    price: typeof t?.price === "number" ? t.price : (t?.price == null ? null : Number(t.price)) ,
    price_after_deadline: null, // populated only by collapseTimeWindows, never by the extractor
    currency: resolveCurrency(t?.currency),
    is_early_bird: !!t?.is_early_bird,
    // Drop bad/out-of-range tier dates to null instead of failing ingestion.
    early_bird_start: saneTierDate(t?.early_bird_start),
    early_bird_end: saneTierDate(t?.early_bird_end),
    deadline: saneTierDate(t?.deadline),
  }));
  return {
    title: String(raw.title ?? "").trim(),
    description: String(raw.description ?? "").trim(),
    city: String(raw.city ?? "").trim(),
    country: String(raw.country ?? "").trim(),
    official_url: String(raw.official_url ?? "").trim(),
    start_date: raw.start_date || null,
    end_date: raw.end_date || null,
    pricing_tiers: tiers,
  };
}

// Strict validation before anything is written live. Returns collected errors.
export function validateExtraction(c: ExtractedConference | null): string[] {
  const errors: string[] = [];
  if (!c) return ["extraction produced no data"];

  if (!c.title) errors.push("missing title");
  if (!c.city) errors.push("missing city");
  if (!c.country) errors.push("missing country");
  if (!c.official_url || !/^https?:\/\//i.test(c.official_url)) errors.push("missing or invalid official_url");
  if (!c.start_date) errors.push("missing start_date");
  if (!isSaneDate(c.start_date)) errors.push("start_date out of range");
  if (!isSaneDate(c.end_date)) errors.push("end_date out of range");
  if (c.start_date && c.end_date && Date.parse(c.end_date) < Date.parse(c.start_date)) {
    errors.push("end_date before start_date");
  }

  // Only fail on pricing when there is no usable pricing at all. Individual bad
  // tier dates were already dropped to null in normalizeExtraction, so they do
  // not fail the conference.
  const priced = c.pricing_tiers.filter((t) => t.price != null && !Number.isNaN(t.price));
  if (priced.length === 0) errors.push("no pricing tier with a numeric price");
  for (const t of priced) {
    if (Number.isNaN(t.price as number)) errors.push(`tier "${t.name}" has a non-numeric price`);
    if (!t.currency) errors.push(`tier "${t.name}" has an unresolved currency`);
  }

  return errors;
}

// True when a Firecrawl JSON payload has at least one numeric price.
export function hasUsablePricing(json: any): boolean {
  if (!json) return false;
  const tiers = Array.isArray(json.pricing_tiers) ? json.pricing_tiers : [];
  return tiers.some((t: any) => typeof t?.price === "number" && !Number.isNaN(t.price));
}

// Price/name/date grounding now lives in the single shared module
// ./grounding.ts (groundPricingTiers). Every extraction path calls it before
// pricing is shown or persisted, so there is exactly one guarded route.

// ---- collapse multi-time-window pricing into one tier per ticket type --------
// A pricing grid (e.g. Early Bird / Second Term / Final for each ticket type)
// arrives as one tier per (name x window). Collapse each name to a SINGLE tier
// mapped to our model: price = the current active window's price,
// price_after_deadline = the next window's price, deadline = the date the current
// window ends. Windows whose deadline has already passed are dropped. Every price
// used is one that was already grounded, so grounding is preserved.
// Time-window phase labels that some pages bake into the tier name itself, e.g.
// "Student Participation SECOND TERM" or "EARLYBIRD REGISTRATION". Stripped to
// recover the base ticket type so windows of the same ticket group together.
const PHASE_LABELS = [
  "super early bird", "super earlybird", "early bird", "early-bird", "earlybird",
  "first term", "second term", "third term", "fourth term", "final term",
  "1st term", "2nd term", "3rd term", "4th term",
  "early registration", "regular registration", "late registration", "final",
  "regular", "standard", "late", "on-site", "on site", "onsite", "advance", "advanced",
].sort((a, b) => b.length - a.length);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const PHASE_RE = new RegExp(`\\b(?:${PHASE_LABELS.map(escapeRe).join("|")})\\b`, "ig");

// Remove phase labels from a tier name, keeping the rest of the punctuation.
function baseDisplayName(name: string): string {
  return (name || "")
    .replace(PHASE_RE, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-|_,:]+|[\s\-|_,:]+$/g, "")
    .trim();
}
// Aggressive key used only for grouping (case/punctuation-insensitive).
function baseKey(name: string): string {
  return baseDisplayName(name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function collapseTimeWindows(tiers: ExtractedTier[], now: Date = new Date()): ExtractedTier[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const windowEndIso = (t: ExtractedTier): string | null => t.deadline || t.early_bird_end || null;
  const windowEndMs = (t: ExtractedTier): number | null => {
    const d = windowEndIso(t);
    if (!d) return null;
    const ms = Date.parse(d);
    return Number.isNaN(ms) ? null : ms;
  };

  // Group by base ticket name (phase label removed), preserving first-seen order.
  const order: string[] = [];
  const groups = new Map<string, ExtractedTier[]>();
  for (const t of tiers) {
    const key = baseKey(t.name) || (t.name || "").trim().toLowerCase() || "tier";
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(t);
  }

  const out: ExtractedTier[] = [];
  for (const key of order) {
    const group = groups.get(key)!;
    const priced = group.filter((t) => t.price != null && !Number.isNaN(t.price as number));
    const distinctDates = new Set(priced.map(windowEndMs).filter((v) => v != null)).size;

    // Only collapse a genuine time-window grid: 2+ priced windows spanning 2+
    // distinct dates. Anything else is left exactly as-is (no merging).
    if (priced.length < 2 || distinctDates < 2) {
      for (const t of group) out.push(t);
      continue;
    }

    const dated = priced.filter((t) => windowEndMs(t) != null).sort((a, b) => windowEndMs(a)! - windowEndMs(b)!);
    const undated = priced.filter((t) => windowEndMs(t) == null);
    // Drop windows whose deadline has already passed. Ordered remaining windows:
    // soonest still-open deadline first, then any undated (open/onsite) window.
    const futureDated = dated.filter((t) => windowEndMs(t)! >= today);
    const remaining = [...futureDated, ...undated];

    let current: ExtractedTier;
    let next: ExtractedTier | null;
    if (remaining.length > 0) {
      current = remaining[0];
      next = remaining.length > 1 ? remaining[1] : null;
    } else {
      // Every window's deadline has passed: keep the most recent one, no rise.
      current = dated[dated.length - 1];
      next = null;
    }

    const currency = current.currency ?? group.find((t) => t.currency)?.currency ?? null;
    out.push({
      name: baseDisplayName(current.name) || current.name,
      price: current.price,
      price_after_deadline: next ? next.price : null,
      currency,
      is_early_bird: !!current.is_early_bird,
      early_bird_start: current.early_bird_start ?? null,
      early_bird_end: null,
      deadline: next ? windowEndIso(current) : null,
    });
  }
  return out;
}
