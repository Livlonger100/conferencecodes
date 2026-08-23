import { supabaseAdmin } from "@/lib/supabase";
import {
  AUTO_APPROVE,
  DISCOVERY_SOURCES,
  DISCOVERY_SOURCES_PER_RUN,
  type DiscoverySource,
} from "./config";
import { callClaude, parseJsonLoose, textFromResponse } from "./claude";
import type { JobLogger } from "./log";
import type { DiscoveredCandidate } from "./types";
import { makeDedupeKey } from "./dedupe";

const OFFSET_KEY = "discovery_offset";

// Rotate through the source list across runs so a single invocation stays well
// under the function timeout, but every source is eventually covered.
async function getOffset(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("pipeline_state")
    .select("value")
    .eq("key", OFFSET_KEY)
    .maybeSingle();
  const v = (data?.value as any)?.offset;
  return typeof v === "number" ? v : 0;
}

async function setOffset(offset: number) {
  await supabaseAdmin
    .from("pipeline_state")
    .upsert({ key: OFFSET_KEY, value: { offset }, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

function pickSources(offset: number): { batch: DiscoverySource[]; nextOffset: number } {
  const n = Math.min(DISCOVERY_SOURCES_PER_RUN, DISCOVERY_SOURCES.length);
  const batch: DiscoverySource[] = [];
  for (let i = 0; i < n; i++) {
    batch.push(DISCOVERY_SOURCES[(offset + i) % DISCOVERY_SOURCES.length]);
  }
  const nextOffset = (offset + n) % DISCOVERY_SOURCES.length;
  return { batch, nextOffset };
}

const DISCOVERY_SYSTEM = `You find real, upcoming AI / machine learning conferences worldwide for a directory.
Return ONLY a JSON array (no prose, no markdown). Each item:
{ "name": string, "url": string (official site), "approx_date": string, "city": string, "country": string }
Rules:
- Only real events you can find, focused on AI / ML / data / generative AI / AI agents.
- Prefer the official conference website for "url".
- approx_date can be coarse (e.g. "March 2026") if exact dates are unclear.
- Do not include pricing. Do not invent events. Return up to 15 items.`;

async function runSource(source: DiscoverySource, logger: JobLogger): Promise<DiscoveredCandidate[]> {
  const prompt =
    source.kind === "search"
      ? `Find AI conferences for this sweep: "${source.query}" (region focus: ${source.region}). Use web search.`
      : `List AI conferences found on this directory/aggregator page: ${source.url} (region focus: ${source.region}). Use web search to open it and extract events.`;

  logger.spend("claude.call", { purpose: "discovery", source: source.label, kind: source.kind });
  const resp = await callClaude({
    system: DISCOVERY_SYSTEM,
    messages: [{ role: "user", content: prompt }],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    maxTokens: 4000,
  });

  const arr = parseJsonLoose<any[]>(textFromResponse(resp));
  if (!Array.isArray(arr)) {
    logger.warn("discovery.no_json", { source: source.label });
    return [];
  }
  const out: DiscoveredCandidate[] = arr
    .filter((x) => x && x.name && x.url)
    .map((x) => ({
      name: String(x.name).trim(),
      url: String(x.url).trim(),
      approx_date: x.approx_date ? String(x.approx_date).trim() : null,
      city: x.city ? String(x.city).trim() : null,
      country: x.country ? String(x.country).trim() : null,
      source: source.label,
    }));
  logger.info("discovery.source_done", { source: source.label, found: out.length });
  return out;
}

export async function runDiscovery(logger: JobLogger) {
  const offset = await getOffset();
  const { batch, nextOffset } = pickSources(offset);
  logger.info("discovery.start", {
    offset,
    sourcesThisRun: batch.map((s) => s.label),
    totalSources: DISCOVERY_SOURCES.length,
    autoApprove: AUTO_APPROVE,
  });

  const found: DiscoveredCandidate[] = [];
  for (const source of batch) {
    try {
      const items = await runSource(source, logger);
      found.push(...items);
    } catch (e: any) {
      logger.error("discovery.source_failed", { source: source.label, error: e?.message });
    }
  }

  // Build rows with dedupe keys; drop in-batch duplicates first.
  const byKey = new Map<string, any>();
  for (const c of found) {
    const dedupe_key = makeDedupeKey({ name: c.name, date: c.approx_date, city: c.city, url: c.url });
    if (!byKey.has(dedupe_key)) {
      byKey.set(dedupe_key, {
        name: c.name,
        url: c.url,
        approx_date: c.approx_date,
        city: c.city,
        country: c.country,
        source: c.source,
        status: AUTO_APPROVE ? "approved" : "discovered",
        dedupe_key,
        updated_at: new Date().toISOString(),
      });
    }
  }
  const rows = [...byKey.values()];

  let inserted = 0;
  if (rows.length > 0) {
    // ignoreDuplicates + unique(dedupe_key) makes re-runs idempotent: existing
    // candidates are skipped, not overwritten.
    const { data, error } = await supabaseAdmin
      .from("discovery_queue")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) logger.error("discovery.insert_failed", { error: error.message });
    else inserted = data?.length ?? 0;
  }

  await setOffset(nextOffset);
  logger.info("discovery.done", { candidatesFound: found.length, uniqueThisRun: rows.length, newInserted: inserted, nextOffset });

  return { candidatesFound: found.length, uniqueThisRun: rows.length, newInserted: inserted };
}
