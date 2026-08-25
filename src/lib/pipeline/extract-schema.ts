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
        "Only include tiers and prices that literally appear on the page. If no ticket prices are shown, return an empty array. Never invent or estimate prices, names, or dates.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exact tier name from the page" },
          price: { type: ["number", "null"], description: "Numeric amount that literally appears on the page, or null if no price is shown. Never estimate." },
          currency: { type: "string", description: "ISO 4217 code, e.g. USD, EUR, GBP" },
          is_early_bird: { type: "boolean" },
          early_bird_start: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
          early_bird_end: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
          deadline: { type: ["string", "null"], description: "Price-change / registration deadline YYYY-MM-DD or null" },
        },
      },
    },
  },
  required: ["title"],
};

// Sent to Firecrawl's JSON extraction alongside the schema. The schema alone does
// not carry a do-not-invent instruction, so this makes it explicit.
export const EXTRACTION_JSON_PROMPT =
  "Extract conference ticket pricing. Only include tiers and prices that literally appear on the page text. If no ticket prices are shown, return an empty pricing_tiers array. Never invent, estimate, or guess prices, tier names, or dates.";

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

// ---- grounding: reject any value not present in the scraped page text -------

// Collapse thousands separators so "1,399" / "1.399" / "1 399" all become "1399".
function collapseThousands(text: string): string {
  let s = (text || "").toLowerCase();
  for (let i = 0; i < 3; i++) s = s.replace(/(\d)[.,\s](\d{3})(?=\D|$)/g, "$1$2");
  return s;
}

// A price is grounded only if its number literally appears in the page text
// (allowing currency symbol / thousands-separator variants). Free (0) tiers are
// grounded if the page mentions "free" or a literal 0.
export function priceAppearsInText(price: number, collapsedText: string): boolean {
  const n = Math.round(price);
  if (n === 0) return /\bfree\b/.test(collapsedText) || /(?<!\d)0(?!\d)/.test(collapsedText);
  return new RegExp(`(?<!\\d)${n}(?!\\d)`).test(collapsedText);
}

const MONTHS_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTHS_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// A date is grounded if the ISO string, a month-name + day, or a dd/mm form
// appears in the page text. Lenient enough to keep dates the page really shows.
export function dateAppearsInText(dateIso: string | null, markdown: string): boolean {
  if (!dateIso) return false;
  const md = (markdown || "").toLowerCase();
  if (md.includes(dateIso.toLowerCase())) return true;
  const [y, m, d] = dateIso.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return false;
  const hasMonth = md.includes(MONTHS_FULL[m - 1]) || md.includes(MONTHS_ABBR[m - 1]);
  const hasDay = new RegExp(`\\b${d}(st|nd|rd|th)?\\b`).test(md);
  if (hasMonth && hasDay) return true;
  const dd = String(d).padStart(2, "0"), mm = String(m).padStart(2, "0");
  return md.includes(`${dd}/${mm}`) || md.includes(`${dd}.${mm}`) || md.includes(`${dd}-${mm}`);
}

// Drop any tier whose numeric price is not present in the page text (fabricated),
// and null out any tier date that is not present in the page text. Tiers with no
// price are kept (nothing to fabricate) but do not count as grounded pricing.
export function groundTiers(tiers: ExtractedTier[], markdown: string): ExtractedTier[] {
  const collapsed = collapseThousands(markdown);
  const out: ExtractedTier[] = [];
  for (const t of tiers) {
    if (t.price != null && !Number.isNaN(t.price) && !priceAppearsInText(t.price, collapsed)) {
      continue; // ungrounded / fabricated price -> drop the tier
    }
    out.push({
      ...t,
      early_bird_start: dateAppearsInText(t.early_bird_start, markdown) ? t.early_bird_start : null,
      early_bird_end: dateAppearsInText(t.early_bird_end, markdown) ? t.early_bird_end : null,
      deadline: dateAppearsInText(t.deadline, markdown) ? t.deadline : null,
    });
  }
  return out;
}

// At least one grounded numeric-priced tier remains.
export function hasGroundedPricing(tiers: ExtractedTier[]): boolean {
  return tiers.some((t) => t.price != null && !Number.isNaN(t.price as number));
}
