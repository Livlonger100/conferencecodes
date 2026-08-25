import { supabaseAdmin } from "@/lib/supabase";
import {
  DISCOVERY_WINDOW_MONTHS,
  FIRECRAWL_ESCALATE_TO_STEALTH,
  INGEST_BATCH_SIZE,
  PIPELINE_CATEGORY,
  discoveryWindow,
  nextRecrawlDays,
} from "./config";
import { callClaude, parseJsonLoose, textFromResponse } from "./claude";
import { firecrawlScrape, firecrawlMap } from "./firecrawl";
import {
  EXTRACTION_JSON_PROMPT,
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM,
  groundTiers,
  hasGroundedPricing,
  normalizeExtraction,
  validateExtraction,
} from "./extract-schema";
import { assessCompleteness, detectPricingSignals } from "./completeness";
import { makeSlug } from "@/lib/slug";
import type { JobLogger } from "./log";
import type { Candidate, Completeness, ExtractedConference, ExtractionResult, ExtractedTier, ExtractionMeta } from "./types";

// ---- page fetch (cheap) ----------------------------------------------------

async function fetchPageText(url: string, timeoutMs = 15000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return "";
  const html = await res.text();
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30000);
}

// ---- Cheap fetch: NON-PRICING fields only ----------------------------------
// Used for title, dates, location, description (and to get page text for the
// completeness signal). Its pricing is intentionally ignored; pricing always
// comes from Firecrawl below.

async function extractBaseFields(
  url: string,
  logger: JobLogger
): Promise<{ base: ExtractedConference | null; pageText: string }> {
  logger.info("base.fetch", { url });
  const pageText = await fetchPageText(url);
  if (!pageText || pageText.length < 400) {
    logger.info("base.thin_page", { url, len: pageText.length });
    return { base: null, pageText };
  }
  logger.spend("claude.call", { purpose: "base_fields", url });
  const resp = await callClaude({
    system: EXTRACTION_SYSTEM,
    messages: [
      { role: "user", content: `Extract the conference data as JSON for this page (${url}).\n\nPage content:\n${pageText}` },
    ],
    maxTokens: 3000,
  });
  const parsed = normalizeExtraction(parseJsonLoose(textFromResponse(resp)));
  return { base: parsed, pageText };
}

// ---- Pricing: Firecrawl, finding the tickets/pricing page if needed --------
// Cheap-first: scrape the given URL; if it has no numeric pricing, follow its
// links to a tickets/pricing page; if that fails, use Firecrawl /map; finally
// try stealth on the given URL. Stops as soon as usable pricing is found.

const PRICING_KEYWORDS = ["tickets", "ticket", "registration", "register", "pricing", "prices", "passes", "pass", "book", "buy", "rates", "fees"];
const STRONG_KEYWORDS = new Set(["tickets", "ticket", "registration", "register", "pricing", "prices"]);

function hostOf(u: string): string {
  try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

// Rank links by pricing-keyword match in the href, preferring same-domain pages.
function rankPricingLinks(links: string[], baseUrl: string): string[] {
  const baseHost = hostOf(baseUrl);
  const baseClean = baseUrl.replace(/\/+$/, "");
  const seen = new Set<string>();
  const scored: { url: string; score: number }[] = [];
  for (const raw of links || []) {
    if (!raw || typeof raw !== "string") continue;
    if (raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
    let abs: string;
    try { abs = new URL(raw, baseUrl).href.split("#")[0]; } catch { continue; }
    if (!/^https?:\/\//i.test(abs)) continue;
    if (abs.replace(/\/+$/, "") === baseClean) continue; // skip self
    if (seen.has(abs)) continue;
    const lower = abs.toLowerCase();
    let score = 0;
    for (const kw of PRICING_KEYWORDS) if (lower.includes(kw)) score += STRONG_KEYWORDS.has(kw) ? 3 : 1;
    if (score === 0) continue;
    if (hostOf(abs) === baseHost) score += 5;
    seen.add(abs);
    scored.push({ url: abs, score });
  }
  scored.sort((a, b) => b.score - a.score || a.url.length - b.url.length);
  return scored.map((s) => s.url);
}

interface PricingFind {
  pricingTiers: ExtractedTier[];
  baseFromGiven: ExtractedConference | null;
  pricingUrl: string | null;
  tried: string[];
  proxyUsed: string;
  firecrawlCalls: number;
}

async function findAndExtractPricing(givenUrl: string, logger: JobLogger): Promise<PricingFind> {
  const schema = EXTRACTION_JSON_SCHEMA;
  const prompt = EXTRACTION_JSON_PROMPT;
  const tried: string[] = [];
  let calls = 0;

  // Extracted tiers are only kept if their prices literally appear in the page
  // markdown; ungrounded/fabricated prices are dropped before deciding "found".
  const grounded = (json: any, markdown: string): ExtractedTier[] =>
    groundTiers(normalizeExtraction(json)?.pricing_tiers ?? [], markdown);

  // 1. The given URL (basic), also fetching its links.
  tried.push(givenUrl);
  calls++;
  const first = await firecrawlScrape({ url: givenUrl, schema, prompt, proxy: "basic", withLinks: true, logger });
  const baseFromGiven = normalizeExtraction(first.json);
  const g1 = grounded(first.json, first.markdown);
  if (hasGroundedPricing(g1)) {
    logger.info("pricing.found", { from: "given", url: givenUrl, tiers: g1.length });
    return { pricingTiers: g1, baseFromGiven, pricingUrl: givenUrl, tried, proxyUsed: "basic", firecrawlCalls: calls };
  }
  const rawCount1 = (normalizeExtraction(first.json)?.pricing_tiers ?? []).filter((t) => t.price != null).length;
  logger.info("pricing.ungrounded", { url: givenUrl, rawPricedTiers: rawCount1, groundedPricedTiers: 0 });

  // 2. Link scan: follow the best pricing/tickets links on that page.
  const linkCands = rankPricingLinks(first.links, givenUrl).slice(0, 2);
  logger.info("pricing.link_candidates", { url: givenUrl, candidates: linkCands });
  for (const cand of linkCands) {
    tried.push(cand);
    calls++;
    const c = await firecrawlScrape({ url: cand, schema, prompt, proxy: "basic", logger });
    const g = grounded(c.json, c.markdown);
    if (hasGroundedPricing(g)) {
      logger.info("pricing.found", { from: "link_scan", url: cand, tiers: g.length });
      return { pricingTiers: g, baseFromGiven, pricingUrl: cand, tried, proxyUsed: "basic", firecrawlCalls: calls };
    }
  }

  // 3. Map fallback: list the site's URLs, pick the best pricing match.
  logger.info("pricing.map_fallback", { url: givenUrl });
  calls++;
  const mapUrls = await firecrawlMap(givenUrl, logger);
  const mapCands = rankPricingLinks(mapUrls, givenUrl).filter((u) => !tried.includes(u)).slice(0, 2);
  logger.info("pricing.map_candidates", { url: givenUrl, candidates: mapCands });
  for (const cand of mapCands) {
    tried.push(cand);
    calls++;
    const c = await firecrawlScrape({ url: cand, schema, prompt, proxy: "basic", logger });
    const g = grounded(c.json, c.markdown);
    if (hasGroundedPricing(g)) {
      logger.info("pricing.found", { from: "map", url: cand, tiers: g.length });
      return { pricingTiers: g, baseFromGiven, pricingUrl: cand, tried, proxyUsed: "basic", firecrawlCalls: calls };
    }
  }

  // 4. Last resort: stealth on the given URL (for anti-bot pages).
  if (FIRECRAWL_ESCALATE_TO_STEALTH) {
    logger.info("pricing.stealth_last_resort", { url: givenUrl });
    tried.push(`${givenUrl} (stealth)`);
    calls++;
    const s = await firecrawlScrape({ url: givenUrl, schema, prompt, proxy: "stealth", withLinks: true, logger });
    const g = grounded(s.json, s.markdown);
    if (hasGroundedPricing(g)) {
      logger.info("pricing.found", { from: "stealth", url: givenUrl, tiers: g.length });
      return { pricingTiers: g, baseFromGiven: normalizeExtraction(s.json) ?? baseFromGiven, pricingUrl: givenUrl, tried, proxyUsed: "stealth", firecrawlCalls: calls };
    }
    logger.warn("pricing.none_found", { url: givenUrl, tried });
    return { pricingTiers: [], baseFromGiven, pricingUrl: null, tried, proxyUsed: "stealth", firecrawlCalls: calls };
  }

  logger.warn("pricing.none_found", { url: givenUrl, tried });
  return { pricingTiers: [], baseFromGiven, pricingUrl: null, tried, proxyUsed: "basic", firecrawlCalls: calls };
}

// ---- Tier 3: future browser-agent tier (STUB, not implemented) -------------
// Kept as a hook for a future browser-driving agent. Not part of the pricing
// path anymore. Reached only if neither the cheap fetch nor Firecrawl returned
// any usable base fields at all.
async function tier3(url: string, logger: JobLogger): Promise<ExtractedConference | null> {
  logger.warn("tier3.not_implemented", { url });
  return null; // TODO: implement browser-agent extraction tier later.
}

function nonEmpty(a: string, b: string): string {
  return a && a.trim() ? a : b;
}

// Merge base (non-pricing) fields: prefer the cheap fetch, fall back to Firecrawl.
function mergeBase(a: ExtractedConference | null, b: ExtractedConference | null): ExtractedConference | null {
  if (!a && !b) return null;
  const x = a ?? b!;
  const y = b ?? a!;
  return {
    title: nonEmpty(x.title, y.title),
    description: nonEmpty(x.description, y.description),
    city: nonEmpty(x.city, y.city),
    country: nonEmpty(x.country, y.country),
    official_url: nonEmpty(x.official_url, y.official_url),
    start_date: x.start_date || y.start_date,
    end_date: x.end_date || y.end_date,
    pricing_tiers: [],
  };
}

// Single extraction path: cheap fetch for base fields, Firecrawl for pricing.
export async function runExtraction(url: string, logger: JobLogger): Promise<ExtractionResult> {
  const cheap = await extractBaseFields(url, logger).catch((e: any) => {
    logger.warn("base.threw", { url, error: e?.message });
    return { base: null as ExtractedConference | null, pageText: "" };
  });

  const signals = detectPricingSignals(cheap.pageText);
  logger.info("pricing.signals", { url, ...signals });

  // Pricing via Firecrawl, finding the tickets/pricing page if the given URL has none.
  let pricing: PricingFind;
  try {
    pricing = await findAndExtractPricing(url, logger);
  } catch (e: any) {
    logger.warn("pricing.finder_threw", { url, error: e?.message });
    pricing = { pricingTiers: [], baseFromGiven: null, pricingUrl: null, tried: [url], proxyUsed: "none", firecrawlCalls: 0 };
  }

  const pricingTiers: ExtractedTier[] = pricing.pricingTiers;
  const base = mergeBase(cheap.base, pricing.baseFromGiven);

  const stealthUsed = pricing.proxyUsed === "stealth";
  const meta: ExtractionMeta = {
    pricingMethod: "tier2",
    proxyUsed: pricing.proxyUsed,
    firecrawlCalls: pricing.firecrawlCalls,
    stealthUsed,
    pricingUrl: pricing.pricingUrl,
    pricingTried: pricing.tried,
  };

  if (!base) {
    await tier3(url, logger); // final hook; returns null today
    const completeness = assessCompleteness({ pricingMethod: "tier2", tiers: pricingTiers, signals });
    return { ok: false, tier: "tier2", data: null, errors: ["no usable extraction (cheap fetch and Firecrawl both empty)"], completeness, meta };
  }

  const data: ExtractedConference = { ...base, pricing_tiers: pricingTiers };
  const errors = validateExtraction(data);
  const completeness = assessCompleteness({ pricingMethod: "tier2", tiers: pricingTiers, signals });
  logger.info("pricing.method", { url, method: "tier2", proxyUsed: pricing.proxyUsed, firecrawlCalls: pricing.firecrawlCalls, pricingUrl: pricing.pricingUrl, tiers: pricingTiers.length, confidence: completeness.score, likelyIncomplete: completeness.likelyIncomplete });

  if (errors.length) {
    // When no pricing page worked, record which pages were tried so it is visible.
    const finalErrors = pricing.pricingUrl ? errors : [...errors, `pricing pages tried: ${pricing.tried.join(", ")}`];
    logger.info("extraction.invalid", { url, errors: finalErrors });
    return { ok: false, tier: "tier2", data: null, errors: finalErrors, completeness, meta };
  }
  logger.info("extraction.valid", { url, note: completeness.note });
  return { ok: true, tier: "tier2", data, errors: [], completeness, meta };
}

// ---- write conference + pricing tiers --------------------------------------

function toIsoDateOrNull(d: string | null): string | null {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

// Apply the SAME rolling window discovery uses (today .. +DISCOVERY_WINDOW_MONTHS)
// to the ingested real dates, so past-dated and far-future scrapes cannot become
// publishable drafts. Returns which bucket the event falls in.
function dateWindowStatus(startIso: string | null, endIso: string | null): "in_window" | "past" | "out_of_window" {
  const start = toIsoDateOrNull(startIso);
  const end = toIsoDateOrNull(endIso) || start;
  if (!start || !end) return "in_window"; // no usable dates; leave to normal review
  const { start: windowStart, end: windowEnd } = discoveryWindow();
  const eventEnd = Date.parse(end);
  const eventStart = Date.parse(start);
  if (eventEnd < windowStart.getTime()) return "past";
  if (eventStart > windowEnd.getTime()) return "out_of_window";
  return "in_window";
}

// Map an extracted country to one of the admin Region options, so a Singapore
// event is not left at the default "North America". Falls back to "Other".
function regionFromCountry(country: string | null | undefined): string {
  const c = (country || "").toLowerCase().trim();
  if (!c) return "Other";
  const NA = ["united states", "usa", "us", "u.s.", "u.s.a.", "america", "canada", "mexico"];
  const EU = ["united kingdom", "uk", "u.k.", "england", "scotland", "wales", "ireland", "france", "germany", "spain", "portugal", "italy", "netherlands", "the netherlands", "holland", "switzerland", "sweden", "norway", "denmark", "finland", "iceland", "poland", "austria", "belgium", "czech republic", "czechia", "greece", "hungary", "romania", "bulgaria", "croatia", "slovenia", "slovakia", "estonia", "latvia", "lithuania", "luxembourg", "malta", "cyprus"];
  const ASIA = ["singapore", "japan", "china", "india", "south korea", "korea", "north korea", "hong kong", "taiwan", "thailand", "vietnam", "viet nam", "malaysia", "indonesia", "philippines", "pakistan", "bangladesh", "sri lanka", "nepal", "cambodia", "laos", "myanmar", "brunei", "mongolia", "kazakhstan"];
  const match = (list: string[]) => list.some((x) => c === x || c.includes(x));
  if (match(NA)) return "North America";
  if (match(EU)) return "Europe";
  if (match(ASIA)) return "Asia";
  return "Other";
}

// Ensure a generated slug does not collide with an existing conference. Appends
// a numeric suffix if needed. Existing rows keep their slug (never rewritten).
async function ensureUniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let n = 2; n <= 50; n++) {
    const { data } = await supabaseAdmin.from("conferences").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

function computeNextRecrawl(data: ExtractedConference): string {
  const now = Date.now();
  const dayMs = 86400000;
  const daysUntilEvent = data.start_date ? Math.ceil((Date.parse(data.start_date) - now) / dayMs) : null;
  const deadlineDays = data.pricing_tiers
    .flatMap((t) => [t.early_bird_end, t.deadline])
    .map((d) => (d ? Math.ceil((Date.parse(d) - now) / dayMs) : null))
    .filter((n): n is number => n != null && n >= 0);
  const daysUntilNearestDeadline = deadlineDays.length ? Math.min(...deadlineDays) : null;
  const days = nextRecrawlDays({ daysUntilEvent, daysUntilNearestDeadline });
  return new Date(now + days * dayMs).toISOString();
}

// Insert or update a conference (dedupe by official URL) and replace its tiers.
// Returns the conference id. Slug is left to the DB default/trigger on insert,
// matching the existing /api/conferences behavior.
export async function writeConference(
  data: ExtractedConference,
  meta: { sourceCandidate: Candidate; completeness: Completeness; extraction: ExtractionMeta },
  logger: JobLogger
): Promise<string> {
  const nextRecrawl = computeNextRecrawl(data);
  // Scraped data is never trusted by default: in-window listings are saved as
  // DRAFT regardless of confidence and only go public when a human approves them.
  // Date-window enforcement (same rule discovery uses): a past-dated event is
  // held as EXPIRED and a far-future one as ARCHIVED, so neither can be
  // accidentally published or appear in the normal draft review list.
  const window = dateWindowStatus(data.start_date, data.end_date);
  const status = window === "past" ? "expired" : window === "out_of_window" ? "archived" : "draft";
  const dateNote =
    window === "past"
      ? " | DATE: event date is in the past, held as expired (not publishable)"
      : window === "out_of_window"
      ? ` | DATE: starts beyond the ${DISCOVERY_WINDOW_MONTHS}-month window, held as archived (not publishable)`
      : "";
  const fcSummary = `Firecrawl ${meta.extraction.firecrawlCalls} call${meta.extraction.firecrawlCalls === 1 ? "" : "s"}${meta.extraction.stealthUsed ? ", stealth" : ""}`;
  const pricingSrc =
    meta.extraction.pricingUrl && meta.extraction.pricingUrl !== data.official_url
      ? ` | pricing from ${meta.extraction.pricingUrl}`
      : "";
  const confRow: Record<string, unknown> = {
    name: data.title,
    description: data.description,
    category: PIPELINE_CATEGORY,
    status,
    confidence: meta.completeness.score,
    start_date: toIsoDateOrNull(data.start_date),
    end_date: toIsoDateOrNull(data.end_date),
    city: data.city,
    country: data.country,
    region: regionFromCountry(data.country),
    source_url: data.official_url,
    registration_url: data.official_url,
    extraction_notes: `${meta.completeness.note} | pricing: ${fcSummary}${pricingSrc}${dateNote} | candidate ${meta.sourceCandidate.id}`,
    next_recrawl_at: nextRecrawl,
    updated_at: new Date().toISOString(),
  };
  logger.info("conference.date_window", { name: data.title, window, status });
  logger.info("conference.completeness", { name: data.title, confidence: meta.completeness.score, likelyIncomplete: meta.completeness.likelyIncomplete, status });

  // Dedupe against existing conferences by official/source URL.
  const { data: existing } = await supabaseAdmin
    .from("conferences")
    .select("id")
    .eq("source_url", data.official_url)
    .maybeSingle();

  let conferenceId: string;
  if (existing?.id) {
    const { error } = await supabaseAdmin.from("conferences").update(confRow).eq("id", existing.id);
    if (error) throw new Error(`conference update failed: ${error.message}`);
    conferenceId = existing.id;
    logger.info("conference.updated", { id: conferenceId, name: data.title });
  } else {
    // Generate a clean slug in the app (year not doubled, length capped) and
    // ensure it is unique. Only on insert; existing slugs are never rewritten.
    const slug = await ensureUniqueSlug(makeSlug(data.title, data.start_date));
    const { data: created, error } = await supabaseAdmin
      .from("conferences")
      .insert({ ...confRow, slug })
      .select("id")
      .single();
    if (error) throw new Error(`conference insert failed: ${error.message}`);
    conferenceId = created.id;
    logger.info("conference.created", { id: conferenceId, name: data.title });
  }

  // Replace pricing tiers.
  await supabaseAdmin.from("pricing_tiers").delete().eq("conference_id", conferenceId);
  const tierRows = data.pricing_tiers.map((t, i) => ({
    conference_id: conferenceId,
    tier_name: t.name,
    price: t.price,
    currency: t.currency || "USD",
    deadline: toIsoDateOrNull(t.deadline || t.early_bird_end),
    early_bird_start: toIsoDateOrNull(t.early_bird_start),
    early_bird_end: toIsoDateOrNull(t.early_bird_end),
    is_early_bird: t.is_early_bird,
    sort_order: i,
    notes: "",
  }));
  if (tierRows.length > 0) {
    const { error } = await supabaseAdmin.from("pricing_tiers").insert(tierRows);
    if (error) throw new Error(`pricing tiers insert failed: ${error.message}`);
  }
  logger.info("pricing.written", { conferenceId, tiers: tierRows.length, nextRecrawl });

  return conferenceId;
}

// ---- batch runner ----------------------------------------------------------
// Claims and processes a small batch of approved candidates. Shared by the
// worker endpoint (/api/jobs/ingest) and the admin-authenticated trigger
// (/api/admin/run). `onlyId` limits the run to a single approved candidate.
export interface IngestItemResult {
  id: string;
  name: string;
  status: string;
  tier: string | null;
  confidence?: number;
  likelyIncomplete?: boolean;
  reason?: string;
}

export async function runIngestBatch(
  logger: JobLogger,
  opts: { onlyId?: string | null } = {}
): Promise<{ processed: number; remainingApproved: number; results: IngestItemResult[] }> {
  const onlyId = opts.onlyId || null;

  let query = supabaseAdmin
    .from("discovery_queue")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(onlyId ? 1 : INGEST_BATCH_SIZE);
  if (onlyId) query = query.eq("id", onlyId);
  const { data: batch, error } = await query;
  if (error) {
    logger.error("ingest.claim_failed", { error: error.message });
    throw new Error(error.message);
  }

  const candidates = (batch ?? []) as Candidate[];
  logger.info("ingest.start", { batchSize: candidates.length, limit: onlyId ? 1 : INGEST_BATCH_SIZE, onlyId });

  const results: IngestItemResult[] = [];
  for (const candidate of candidates) {
    logger.info("ingest.item", { id: candidate.id, name: candidate.name, url: candidate.url });
    try {
      const extraction = await runExtraction(candidate.url, logger);

      if (!extraction.ok || !extraction.data) {
        const reason = extraction.errors.join("; ") || "extraction failed";
        await supabaseAdmin
          .from("discovery_queue")
          .update({ status: "failed", notes: reason, tier_used: extraction.tier, updated_at: new Date().toISOString() })
          .eq("id", candidate.id);
        logger.warn("ingest.failed", { id: candidate.id, reason });
        results.push({ id: candidate.id, name: candidate.name, status: "failed", tier: extraction.tier, reason });
        continue;
      }

      const conferenceId = await writeConference(
        extraction.data,
        { sourceCandidate: candidate, completeness: extraction.completeness!, extraction: extraction.meta },
        logger
      );

      await supabaseAdmin
        .from("discovery_queue")
        .update({
          status: "ingested",
          conference_id: conferenceId,
          tier_used: extraction.tier,
          notes: extraction.completeness?.note ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id);

      logger.info("ingest.success", { id: candidate.id, conferenceId, tier: extraction.tier, confidence: extraction.completeness?.score, likelyIncomplete: extraction.completeness?.likelyIncomplete });
      results.push({ id: candidate.id, name: candidate.name, status: "ingested", tier: extraction.tier, confidence: extraction.completeness?.score, likelyIncomplete: extraction.completeness?.likelyIncomplete });
    } catch (e: any) {
      const reason = e?.message || "unexpected error";
      await supabaseAdmin
        .from("discovery_queue")
        .update({ status: "failed", notes: reason, updated_at: new Date().toISOString() })
        .eq("id", candidate.id);
      logger.error("ingest.exception", { id: candidate.id, reason });
      results.push({ id: candidate.id, name: candidate.name, status: "failed", tier: null, reason });
    }
  }

  const { count } = await supabaseAdmin
    .from("discovery_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");

  logger.info("ingest.done", { processed: results.length, remainingApproved: count ?? 0 });
  return { processed: results.length, remainingApproved: count ?? 0, results };
}
