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
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exact tier name from the page" },
          price: { type: ["number", "null"], description: "Numeric amount only, null if not shown" },
          currency: { type: "string", description: "ISO 4217 code, e.g. USD, EUR, GBP" },
          is_early_bird: { type: "boolean" },
          early_bird_start: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
          early_bird_end: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
          deadline: { type: ["string", "null"], description: "Price-change / registration deadline YYYY-MM-DD or null" },
        },
        required: ["name"],
      },
    },
  },
  required: ["title", "pricing_tiers"],
};

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

// Coerce a loose extracted object into our ExtractedConference shape.
export function normalizeExtraction(raw: any): ExtractedConference | null {
  if (!raw || typeof raw !== "object") return null;
  const tiersRaw = Array.isArray(raw.pricing_tiers) ? raw.pricing_tiers : [];
  const tiers: ExtractedTier[] = tiersRaw.map((t: any) => ({
    name: String(t?.name ?? "").trim() || "Standard",
    price: typeof t?.price === "number" ? t.price : (t?.price == null ? null : Number(t.price)) ,
    currency: resolveCurrency(t?.currency),
    is_early_bird: !!t?.is_early_bird,
    early_bird_start: t?.early_bird_start || null,
    early_bird_end: t?.early_bird_end || null,
    deadline: t?.deadline || null,
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

  const priced = c.pricing_tiers.filter((t) => t.price != null && !Number.isNaN(t.price));
  if (priced.length === 0) errors.push("no pricing tier with a numeric price");
  for (const t of priced) {
    if (Number.isNaN(t.price as number)) errors.push(`tier "${t.name}" has a non-numeric price`);
    if (!t.currency) errors.push(`tier "${t.name}" has an unresolved currency`);
    if (!isSaneDate(t.early_bird_start)) errors.push(`tier "${t.name}" early_bird_start out of range`);
    if (!isSaneDate(t.early_bird_end)) errors.push(`tier "${t.name}" early_bird_end out of range`);
    if (!isSaneDate(t.deadline)) errors.push(`tier "${t.name}" deadline out of range`);
  }

  return errors;
}

// True when a Firecrawl JSON payload has at least one numeric price (used to
// decide whether to escalate to stealth).
export function hasUsablePricing(json: any): boolean {
  if (!json) return false;
  const tiers = Array.isArray(json.pricing_tiers) ? json.pricing_tiers : [];
  return tiers.some((t: any) => typeof t?.price === "number" && !Number.isNaN(t.price));
}
