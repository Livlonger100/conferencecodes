import { supabaseAdmin } from "@/lib/supabase";
import {
  FIRECRAWL_ESCALATE_TO_STEALTH,
  INGEST_PUBLISH_STATUS,
  PIPELINE_CATEGORY,
  nextRecrawlDays,
} from "./config";
import { callClaude, parseJsonLoose, textFromResponse } from "./claude";
import { firecrawlExtract } from "./firecrawl";
import {
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_SYSTEM,
  hasUsablePricing,
  normalizeExtraction,
  validateExtraction,
} from "./extract-schema";
import type { JobLogger } from "./log";
import type { Candidate, ExtractedConference, ExtractionResult, IngestTier } from "./types";

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

// ---- Tier 1: cheap fetch + Claude parse ------------------------------------

async function tier1(url: string, logger: JobLogger): Promise<ExtractedConference | null> {
  logger.info("tier1.fetch", { url });
  const pageText = await fetchPageText(url);
  if (!pageText || pageText.length < 400) {
    logger.info("tier1.thin_page", { url, len: pageText.length });
    return null;
  }
  logger.spend("claude.call", { purpose: "tier1_parse", url });
  const resp = await callClaude({
    system: EXTRACTION_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Extract the conference data as JSON for this page (${url}).\n\nPage content:\n${pageText}`,
      },
    ],
    maxTokens: 3000,
  });
  const parsed = parseJsonLoose(textFromResponse(resp));
  return normalizeExtraction(parsed);
}

// ---- Tier 2: Firecrawl JSON extraction (renders JS) ------------------------

async function tier2(url: string, logger: JobLogger): Promise<ExtractedConference | null> {
  const result = await firecrawlExtract({
    url,
    schema: EXTRACTION_JSON_SCHEMA,
    logger,
    escalateToStealth: FIRECRAWL_ESCALATE_TO_STEALTH,
    hasUsableData: hasUsablePricing,
  });
  logger.info("tier2.done", { url, proxyUsed: result.proxyUsed });
  return normalizeExtraction(result.json);
}

// ---- Tier 3: future browser-agent tier (STUB — not implemented) ------------
// Escalation hook. When Tier 1 and Tier 2 both fail, a future browser-driving
// agent (e.g. a Playwright/agent worker) would go here. Intentionally not built.
async function tier3(url: string, logger: JobLogger): Promise<ExtractedConference | null> {
  logger.warn("tier3.not_implemented", { url });
  return null; // TODO: implement browser-agent extraction tier later.
}

// ---- tiered runner ---------------------------------------------------------

export async function runTieredExtraction(url: string, logger: JobLogger): Promise<ExtractionResult> {
  const attempts: { tier: IngestTier; fn: (u: string, l: JobLogger) => Promise<ExtractedConference | null> }[] = [
    { tier: "tier1", fn: tier1 },
    { tier: "tier2", fn: tier2 },
    { tier: "tier3", fn: tier3 },
  ];

  let lastErrors: string[] = ["all tiers exhausted"];
  for (const attempt of attempts) {
    let data: ExtractedConference | null = null;
    try {
      data = await attempt.fn(url, logger);
    } catch (e: any) {
      logger.warn(`${attempt.tier}.threw`, { url, error: e?.message });
      lastErrors = [`${attempt.tier} error: ${e?.message}`];
      continue;
    }
    const errors = validateExtraction(data);
    if (errors.length === 0 && data) {
      logger.info("extraction.valid", { url, tier: attempt.tier });
      return { ok: true, tier: attempt.tier, data, errors: [] };
    }
    logger.info(`${attempt.tier}.invalid`, { url, errors });
    lastErrors = errors.length ? errors : [`${attempt.tier} produced no data`];
  }
  return { ok: false, tier: null, data: null, errors: lastErrors };
}

// ---- write conference + pricing tiers --------------------------------------

function toIsoDateOrNull(d: string | null): string | null {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
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
  meta: { tier: IngestTier; sourceCandidate: Candidate },
  logger: JobLogger
): Promise<string> {
  const nextRecrawl = computeNextRecrawl(data);
  const confRow: Record<string, unknown> = {
    name: data.title,
    description: data.description,
    category: PIPELINE_CATEGORY,
    status: INGEST_PUBLISH_STATUS,
    start_date: toIsoDateOrNull(data.start_date),
    end_date: toIsoDateOrNull(data.end_date),
    city: data.city,
    country: data.country,
    source_url: data.official_url,
    registration_url: data.official_url,
    extraction_notes: `Ingested via ${meta.tier} from candidate ${meta.sourceCandidate.id}`,
    next_recrawl_at: nextRecrawl,
    updated_at: new Date().toISOString(),
  };

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
    const { data: created, error } = await supabaseAdmin
      .from("conferences")
      .insert(confRow)
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
