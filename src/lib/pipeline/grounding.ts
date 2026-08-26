import type { ExtractedTier } from "./types";

// ============================================================
// SHARED PRICING GROUNDING
// The single guarded gate that EVERY extraction path must call before pricing
// is shown or persisted (Add New, Bulk Import, Scrape, Re-scrape, discovery
// ingestion, and the pricing-page finder fallback). A tier survives only if its
// name, its price, and their pairing are all evidenced in the raw scraped page
// text. Self-reported model confidence is never trusted; only text evidence is.
// ============================================================

export interface TierEvidence {
  name: string;
  price: number | null;
  currency: string | null;
  snippet: string; // ~120 chars of raw page text where name + price were grounded
}
export interface DroppedTier {
  name: string;
  reason: string;
}
export interface ExcludedTier {
  name: string;
  keyword: string;
}
export interface GroundingReport {
  kept: TierEvidence[];
  dropped: DroppedTier[];
  excluded: ExcludedTier[];
  window: number;
}
export interface GroundingResult {
  tiers: ExtractedTier[];
  report: GroundingReport;
}

const CUR_SYMBOLS = "$€£¥₹";
const CUR_CODES = ["usd", "eur", "gbp", "jpy", "inr", "aud", "cad", "sgd", "chf", "aed", "zar", "brl", "cny", "krw", "mxn", "sek", "nok", "dkk", "pln", "czk", "huf"];
const MONTHS_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTHS_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Names the extractor tends to invent. They are only ever accepted when they
// literally appear on the page (enforced by the name check below); this list is
// documentation plus a guard against near-empty generic names.
const DEFAULT_INVENTIONS = new Set([
  "early rate", "standard rate", "advance rate", "late rate", "final rate", "regular rate",
  "early bird", "super early bird", "tier 1", "tier 2", "general admission",
]);

// Line items that are not conference admission and must never be written as
// pricing tiers. Matched case-insensitively as a substring of the tier name.
const NON_ADMISSION = [
  "accommodation", "hotel", "nights", "night", "room", "gala dinner", "banquet",
  "dinner ticket", "city tour", "excursion", "extra page", "additional page",
  "publication fee", "page charge", "visa letter", "invitation letter", "shipping",
];
export function nonAdmissionKeyword(name: string): string | null {
  const n = (name || "").toLowerCase();
  for (const kw of NON_ADMISSION) if (n.includes(kw)) return kw;
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Insert a thousands separator into a plain digit string ("1999" -> "1,999").
function withSep(digits: string, sep: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

// Written forms of a price we accept: 1999, 1,999, 1.999, 1 999.
function priceForms(price: number): string[] {
  const n = Math.round(price);
  const plain = String(n);
  const forms = new Set<string>([plain]);
  if (n >= 1000) {
    forms.add(withSep(plain, ","));
    forms.add(withSep(plain, "."));
    forms.add(withSep(plain, " "));
  }
  return [...forms];
}

function allIndexes(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let from = 0;
  while (true) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) break;
    out.push(i);
    from = i + needle.length;
  }
  return out;
}

export interface GroundingContext {
  raw: string; // whitespace-collapsed page text (case preserved for snippets)
  low: string; // lowercased copy (same indexes) for matching
}

export function buildContext(rawText: string): GroundingContext {
  const raw = (rawText || "").replace(/\s+/g, " ");
  return { raw, low: raw.toLowerCase() };
}

// True if a currency symbol or code sits within a few characters of [idx, idx+len).
function currencyAdjacent(low: string, idx: number, len: number): boolean {
  const a = Math.max(0, idx - 8);
  const b = Math.min(low.length, idx + len + 8);
  const w = low.slice(a, b);
  if ([...CUR_SYMBOLS].some((s) => w.includes(s))) return true;
  return CUR_CODES.some((c) => new RegExp(`\\b${c}\\b`).test(w));
}

// Indexes where the price appears as a standalone number adjacent to a currency.
// The lookbehind/ahead prevent matching a fragment of a larger grouped number
// (e.g. "999" inside "1,999"), which rejects chart-axis / date / count digits.
function groundedPriceIndexes(ctx: GroundingContext, price: number): number[] {
  const out: number[] = [];
  for (const form of priceForms(price)) {
    const re = new RegExp(`(?<![\\d.,])${escapeRe(form)}(?![\\d])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(ctx.low)) !== null) {
      if (currencyAdjacent(ctx.low, m.index, form.length)) out.push(m.index);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
}

// A date resolves-and-appears inside the given window text (ISO, month-name+day,
// or dd/mm forms). Used to ground a tier deadline only near its own name/price.
function dateAppearsInWindow(dateIso: string | null, windowLow: string): boolean {
  if (!dateIso) return false;
  if (windowLow.includes(dateIso.toLowerCase())) return true;
  const [y, m, d] = dateIso.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return false;
  const hasMonth = windowLow.includes(MONTHS_FULL[m - 1]) || windowLow.includes(MONTHS_ABBR[m - 1]);
  // Accept both "3" and zero-padded "03".
  const hasDay = new RegExp(`\\b0?${d}(?:st|nd|rd|th)?\\b`).test(windowLow);
  if (hasMonth && hasDay) return true;
  const dd = String(d).padStart(2, "0"), mm = String(m).padStart(2, "0");
  return windowLow.includes(`${dd}/${mm}`) || windowLow.includes(`${dd}.${mm}`) || windowLow.includes(`${dd}-${mm}`);
}

function windowLowAround(ctx: GroundingContext, idx: number, window: number): string {
  return ctx.low.slice(Math.max(0, idx - window), Math.min(ctx.low.length, idx + window));
}

function snippetAround(ctx: GroundingContext, start: number, end: number): string {
  const pad = 30;
  const a = Math.max(0, Math.min(start, end) - pad);
  const b = Math.min(ctx.raw.length, Math.max(start, end) + pad);
  return ctx.raw.slice(a, b).trim().slice(0, 120);
}

// The gate. Returns only grounded tiers plus a mechanical evidence report.
export function groundPricingTiers(
  tiers: ExtractedTier[],
  rawText: string,
  opts: { window?: number; context?: GroundingContext } = {}
): GroundingResult {
  const window = opts.window ?? 600;
  const ctx = opts.context ?? buildContext(rawText);
  const kept: ExtractedTier[] = [];
  const keptEvidence: TierEvidence[] = [];
  const dropped: DroppedTier[] = [];
  const excluded: ExcludedTier[] = [];

  for (const t of tiers) {
    const name = (t.name || "").trim();
    if (name.length < 2) { dropped.push({ name: name || "(unnamed)", reason: "empty tier name" }); continue; }

    // Non-admission line items (accommodation, publication fees, etc.) are
    // reported for the reviewer but never persisted as pricing tiers.
    const exKw = nonAdmissionKeyword(name);
    if (exKw) {
      if (!excluded.some((e) => e.name.toLowerCase() === name.toLowerCase())) excluded.push({ name, keyword: exKw });
      continue;
    }

    // RULE 1: tier name must appear verbatim on the page.
    const nameIdxs = allIndexes(ctx.low, name.toLowerCase());
    if (nameIdxs.length === 0) {
      dropped.push({ name, reason: DEFAULT_INVENTIONS.has(name.toLowerCase()) ? "invented name, not on page" : "name not found in page text" });
      continue;
    }

    // RULE 6: free tier. price 0 only if "free" sits near a grounded name.
    if (t.price === 0) {
      const ni = nameIdxs.find((i) => /\bfree\b/.test(windowLowAround(ctx, i, window)));
      if (ni == null) { dropped.push({ name, reason: "free not stated near tier name" }); continue; }
      kept.push({ ...t, price: 0, price_after_deadline: null, deadline: null, early_bird_end: null });
      keptEvidence.push({ name, price: 0, currency: t.currency, snippet: snippetAround(ctx, ni, ni + name.length) });
      continue;
    }

    if (t.price == null || Number.isNaN(t.price)) { dropped.push({ name, reason: "no numeric price" }); continue; }

    // RULE 2: price must appear verbatim, adjacent to a currency marker.
    const priceIdxs = groundedPriceIndexes(ctx, t.price as number);
    if (priceIdxs.length === 0) { dropped.push({ name, reason: `price ${t.price} not found adjacent to a currency` }); continue; }

    // RULE 3: a name occurrence and a price occurrence must co-occur within window.
    let pair: { ni: number; pi: number; dist: number } | null = null;
    for (const ni of nameIdxs) {
      for (const pi of priceIdxs) {
        const dist = Math.abs(ni - pi);
        if (dist <= window && (!pair || dist < pair.dist)) pair = { ni, pi, dist };
      }
    }
    if (!pair) { dropped.push({ name, reason: `name and price ${t.price} not within ${window} chars` }); continue; }

    const winLow = windowLowAround(ctx, pair.ni, window);

    // RULE 4: deadline only if a resolving date appears in the tier's window.
    const rawDeadline = t.deadline || t.early_bird_end || null;
    const deadline = rawDeadline && dateAppearsInWindow(rawDeadline, winLow) ? rawDeadline : null;

    // RULE 5: after-deadline price only if that number is itself grounded near the tier.
    let priceAfter: number | null = null;
    if (t.price_after_deadline != null && !Number.isNaN(t.price_after_deadline)) {
      const afterIdxs = groundedPriceIndexes(ctx, t.price_after_deadline);
      if (afterIdxs.some((ai) => Math.abs(ai - pair!.ni) <= window)) priceAfter = t.price_after_deadline;
    }

    kept.push({
      ...t,
      deadline,
      early_bird_end: deadline,
      early_bird_start: t.early_bird_start && dateAppearsInWindow(t.early_bird_start, winLow) ? t.early_bird_start : null,
      price_after_deadline: priceAfter,
    });
    keptEvidence.push({
      name,
      price: t.price as number,
      currency: t.currency,
      snippet: snippetAround(ctx, pair.ni, pair.pi + String(Math.round(t.price as number)).length),
    });
  }

  return { tiers: kept, report: { kept: keptEvidence, dropped, excluded, window } };
}

// At least one grounded tier survived.
export function hasGroundedTiers(result: GroundingResult): boolean {
  return result.tiers.length > 0;
}

// Compact human-readable report for the admin draft view / extraction_notes.
export function formatGroundingReport(report: GroundingReport): string {
  const lines: string[] = [];
  lines.push(`Grounded ${report.kept.length} tier${report.kept.length === 1 ? "" : "s"} against page text (window ${report.window} chars):`);
  for (const k of report.kept) {
    const priceStr = k.price === 0 ? "Free" : `${k.currency || ""} ${k.price}`.trim();
    lines.push(`- ${k.name} (${priceStr}): "${k.snippet}"`);
  }
  if (report.dropped.length) {
    lines.push(`Dropped ${report.dropped.length} ungrounded tier${report.dropped.length === 1 ? "" : "s"}: ${report.dropped.map((d) => `${d.name} [${d.reason}]`).join("; ")}`);
  }
  if (report.excluded.length) {
    lines.push(`Excluded ${report.excluded.length} non-admission line item${report.excluded.length === 1 ? "" : "s"}: ${report.excluded.map((e) => `${e.name} [${e.keyword}]`).join("; ")}`);
  }
  return lines.join("\n");
}
