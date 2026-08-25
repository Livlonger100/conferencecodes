// Shared types for the discovery + ingestion pipeline.

export type CandidateStatus =
  | "discovered"
  | "approved"
  | "rejected"
  | "ingested"
  | "failed";

// A discovered candidate conference (queue row). No pricing at this stage.
export interface Candidate {
  id: string;
  name: string;
  url: string;
  approx_date: string | null;
  city: string | null;
  country: string | null;
  source: string | null;
  status: CandidateStatus;
  dedupe_key: string;
  conference_id: string | null;
  tier_used: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// What discovery emits before dedupe/insert.
export interface DiscoveredCandidate {
  name: string;
  full_name: string | null;
  short_description: string | null;
  url: string;
  approx_date: string | null;
  city: string | null;
  country: string | null;
  source: string;
}

// One pricing tier as extracted by ingestion.
export interface ExtractedTier {
  name: string;
  price: number | null;
  currency: string | null;
  is_early_bird: boolean;
  early_bird_start: string | null; // ISO date
  early_bird_end: string | null; // ISO date
  deadline: string | null; // ISO date (generic price-change / registration deadline)
}

// Full structured extraction for one conference (ingestion output, pre-validation).
export interface ExtractedConference {
  title: string;
  description: string;
  city: string;
  country: string;
  official_url: string;
  start_date: string | null; // ISO date
  end_date: string | null; // ISO date
  pricing_tiers: ExtractedTier[];
}

export type IngestTier = "tier1" | "tier2" | "tier3";

// Explainable completeness signal for a pricing extraction.
export interface Completeness {
  score: number; // 0..1, stored in conferences.confidence
  likelyIncomplete: boolean; // true when the page implies more pricing than captured
  note: string; // short human-readable summary, e.g. "3 tiers, early-bird captured, Firecrawl"
}

// Firecrawl call metadata, surfaced in the admin review view.
export interface ExtractionMeta {
  pricingMethod: IngestTier;
  proxyUsed: string; // "basic" | "stealth" | "none"
  firecrawlCalls: number;
  stealthUsed: boolean;
}

export interface ExtractionResult {
  ok: boolean;
  tier: IngestTier | null; // which method produced the final pricing
  data: ExtractedConference | null;
  errors: string[];
  completeness: Completeness | null;
  meta: ExtractionMeta;
}
