import type { Completeness, ExtractedTier, IngestTier } from "./types";

// Completeness / confidence signals for a pricing extraction. Pricing itself is
// always extracted with Firecrawl (see ingest.ts); this module only judges how
// complete that capture looks, using cheap-fetch page text as corroboration.
// Everything here is deliberately simple and tunable.

export interface PricingSignals {
  hasSignal: boolean;
  tierWordCount: number; // distinct tier-ish words seen on the page
  currencyAmountCount: number; // distinct currency-amount patterns seen
  mentionsEarlyBird: boolean;
  hasRegisterLink: boolean;
  impliedTierCount: number; // rough lower bound of how many tiers the page implies
}

// Words that suggest a multi-tier pricing / registration structure.
const TIER_WORDS = [
  "early bird", "early-bird", "earlybird", "regular", "standard", "general admission",
  "tier", "pass", "package", "vip", "student", "group", "late", "super early",
  "on-site", "onsite", "day pass", "full conference", "workshop",
];
const REGISTER_WORDS = ["register", "registration", "tickets", "ticket", "buy now", "get tickets", "pricing", "book now"];

export function detectPricingSignals(pageText: string | null): PricingSignals {
  const s = (pageText || "").toLowerCase();
  if (!s) {
    return { hasSignal: false, tierWordCount: 0, currencyAmountCount: 0, mentionsEarlyBird: false, hasRegisterLink: false, impliedTierCount: 0 };
  }
  const tierWords = new Set<string>();
  for (const w of TIER_WORDS) if (s.includes(w)) tierWords.add(w);
  const mentionsEarlyBird = s.includes("early bird") || s.includes("early-bird") || s.includes("earlybird");
  const hasRegisterLink = REGISTER_WORDS.some((w) => s.includes(w));

  // Currency-amount patterns: "$1,299", "€1.299", "£999", "1299 USD", "USD 1299".
  const amountRegex =
    /(?:[$€£¥₹]\s?\d[\d.,]{2,})|(?:\b\d[\d.,]{2,}\s?(?:usd|eur|gbp|jpy|inr|aud|cad|sgd|chf)\b)|(?:\b(?:usd|eur|gbp)\s?\d[\d.,]{2,})/gi;
  const amounts = s.match(amountRegex) || [];
  const currencyAmountCount = new Set(amounts.map((a) => a.replace(/\s+/g, ""))).size;

  const tierWordCount = tierWords.size;
  const impliedTierCount = Math.max(tierWordCount, currencyAmountCount);
  const hasSignal = tierWordCount > 0 || currencyAmountCount > 0 || hasRegisterLink || mentionsEarlyBird;
  return { hasSignal, tierWordCount, currencyAmountCount, mentionsEarlyBird, hasRegisterLink, impliedTierCount };
}

// Produce an explainable completeness score + likely-incomplete flag + note.
export function assessCompleteness(opts: {
  pricingMethod: IngestTier;
  tiers: ExtractedTier[];
  signals: PricingSignals;
}): Completeness {
  const priced = opts.tiers.filter((t) => t.price != null && !Number.isNaN(t.price as number));
  const hasDeadline = opts.tiers.some((t) => t.early_bird_start || t.early_bird_end || t.deadline);
  const s = opts.signals;

  let score = 0.5;
  if (opts.pricingMethod === "tier2") score += 0.2; // pricing rendered via Firecrawl
  if (priced.length >= 2) score += 0.15;
  if (hasDeadline) score += 0.15;

  const reasons: string[] = [];
  let likelyIncomplete = false;
  if (priced.length === 0) { likelyIncomplete = true; reasons.push("no priced tiers captured"); }
  if (s.mentionsEarlyBird && !hasDeadline) { likelyIncomplete = true; reasons.push("page mentions early bird but no deadline captured"); }
  if (s.impliedTierCount > priced.length) { likelyIncomplete = true; reasons.push(`page suggests about ${s.impliedTierCount} tiers, captured ${priced.length}`); }

  if (likelyIncomplete) score = Math.min(score, 0.4);
  score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));

  const method = opts.pricingMethod === "tier2" ? "Firecrawl" : opts.pricingMethod === "tier1" ? "static fetch" : "stub";
  const ebText = hasDeadline ? "early-bird captured" : "no early-bird dates";
  let note = `${priced.length} tier${priced.length === 1 ? "" : "s"}, ${ebText}, ${method}`;
  if (likelyIncomplete) note += ` - likely incomplete, REVIEW (${reasons.join("; ")})`;

  return { score, likelyIncomplete, note };
}
