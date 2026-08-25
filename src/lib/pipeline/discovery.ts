import { supabaseAdmin } from "@/lib/supabase";
import {
  AUTO_APPROVE,
  DISCOVERY_SOURCES_PER_RUN,
  DISCOVERY_WINDOW_MONTHS,
  discoveryWindow,
  discoveryYearsPhrase,
  getDiscoverySources,
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

function pickSources(offset: number, sources: DiscoverySource[]): { batch: DiscoverySource[]; nextOffset: number } {
  const n = Math.min(DISCOVERY_SOURCES_PER_RUN, sources.length);
  const batch: DiscoverySource[] = [];
  for (let i = 0; i < n; i++) {
    batch.push(sources[(offset + i) % sources.length]);
  }
  const nextOffset = (offset + n) % sources.length;
  return { batch, nextOffset };
}

// Best-effort parse of a coarse approx_date string into an earliest/latest date
// range (UTC). Returns null when nothing usable is found (missing dates are kept
// and flagged, not dropped). Examples handled: "2026-03-12", "March 15-18, 2026",
// "October 2026", "2027".
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function endOfMonthDay(year: number, monthIdx: number): number {
  return new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
}

function parseApproxDate(raw: string | null): { earliest: Date; latest: Date } | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  const yearMatches = s.match(/20\d{2}/g);
  if (!yearMatches) {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      return { earliest: d, latest: d };
    }
    return null;
  }
  const yearStart = parseInt(yearMatches[0], 10);
  const yearEnd = parseInt(yearMatches[yearMatches.length - 1], 10);

  const monthIdxs: number[] = [];
  MONTHS.forEach((m, i) => {
    if (new RegExp(`\\b${m}`).test(s)) monthIdxs.push(i);
  });
  if (monthIdxs.length === 0) {
    // Year only: treat as the whole year so partial-year events are reviewed.
    return { earliest: new Date(Date.UTC(yearStart, 0, 1)), latest: new Date(Date.UTC(yearEnd, 11, 31)) };
  }
  const firstMonth = Math.min(...monthIdxs);
  const lastMonth = Math.max(...monthIdxs);
  const dayNums = (s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/g) || [])
    .map((x) => parseInt(x, 10))
    .filter((n) => n >= 1 && n <= 31);
  const firstDay = dayNums.length ? Math.min(...dayNums) : 1;
  const lastDay = dayNums.length ? Math.max(...dayNums) : endOfMonthDay(yearEnd, lastMonth);
  return {
    earliest: new Date(Date.UTC(yearStart, firstMonth, firstDay)),
    latest: new Date(Date.UTC(yearEnd, lastMonth, Math.min(lastDay, endOfMonthDay(yearEnd, lastMonth)))),
  };
}

const DISCOVERY_SYSTEM = `You find real, upcoming AI / machine learning conferences worldwide for a directory.
Return ONLY a JSON array (no prose, no markdown). Each item:
{ "name": string, "full_name": string, "short_description": string, "url": string (official site), "approx_date": string, "city": string, "country": string }
Rules:
- Only real events you can find, focused on AI / ML / data / generative AI / AI agents.
- name is the common name as shown (may be an acronym, e.g. "ICLR 2027").
- full_name is the expanded name when the name is an acronym or abbreviation (e.g. "International Conference on Learning Representations"); if the name is already full, repeat it.
- short_description is one plain line of about 15 to 25 words describing what the conference is and who it is for. Base it on the search results only. Do not use an em dash.
- Prefer the official conference website for "url".
- approx_date can be coarse (e.g. "March 2026") if exact dates are unclear.
- Only include upcoming events (today or later), ideally within the next 18 months.
- Do not include pricing. Do not invent events. Return up to 15 items.`;

// Load discovery sources from the DB (editable in admin), falling back to the
// hardcoded config defaults if the table is empty or unavailable. {YEARS} in a
// stored query is interpolated with the current rolling window.
async function loadSources(now: Date, logger: JobLogger): Promise<DiscoverySource[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("discovery_sources")
      .select("kind, label, query, url, region, enabled, sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    if (data && data.length > 0) {
      const YEARS = discoveryYearsPhrase(now);
      logger.info("discovery.sources_from_db", { count: data.length });
      return data.map((r: any) =>
        r.kind === "directory"
          ? { kind: "directory", label: r.label, url: r.url || "", region: r.region || "Global" }
          : { kind: "search", label: r.label, query: String(r.query || "").replace(/\{YEARS\}/g, YEARS), region: r.region || "Global" }
      );
    }
  } catch (e: any) {
    logger.warn("discovery.sources_db_unavailable", { error: e?.message });
  }
  logger.info("discovery.sources_from_config", {});
  return getDiscoverySources(now);
}

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
      full_name: x.full_name ? String(x.full_name).trim() : null,
      short_description: x.short_description ? String(x.short_description).trim() : null,
      url: String(x.url).trim(),
      approx_date: x.approx_date ? String(x.approx_date).trim() : null,
      city: x.city ? String(x.city).trim() : null,
      country: x.country ? String(x.country).trim() : null,
      source: source.label,
    }));
  logger.info("discovery.source_done", { source: source.label, found: out.length });
  return out;
}

export async function runDiscovery(logger: JobLogger, options: { dryRun?: boolean; now?: Date } = {}) {
  const dryRun = !!options.dryRun;
  const now = options.now ?? new Date();
  const sources = await loadSources(now, logger);
  const { start: today, end: windowEnd } = discoveryWindow(now);

  const offset = await getOffset();
  const { batch, nextOffset } = pickSources(offset, sources);
  logger.info("discovery.start", {
    offset,
    dryRun,
    sourcesThisRun: batch.map((s) => s.label),
    totalSources: sources.length,
    windowStart: today.toISOString().slice(0, 10),
    windowEnd: windowEnd.toISOString().slice(0, 10),
    windowMonths: DISCOVERY_WINDOW_MONTHS,
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

  // Dedupe in-batch first.
  const byKey = new Map<string, any>();
  for (const c of found) {
    const dedupe_key = makeDedupeKey({ name: c.name, date: c.approx_date, city: c.city, url: c.url });
    if (!byKey.has(dedupe_key)) {
      byKey.set(dedupe_key, {
        name: c.name,
        full_name: c.full_name,
        short_description: c.short_description,
        url: c.url,
        approx_date: c.approx_date,
        city: c.city,
        country: c.country,
        source: c.source,
        status: AUTO_APPROVE ? "approved" : "discovered",
        dedupe_key,
        notes: null,
        updated_at: new Date().toISOString(),
      });
    }
  }

  // Apply the rolling date window: drop past-dated and too-far-out candidates,
  // keep (and flag) candidates whose date cannot be parsed.
  const rows: any[] = [];
  let pastDropped = 0;
  let tooFarDropped = 0;
  let undatedFlagged = 0;
  for (const row of byKey.values()) {
    const parsed = parseApproxDate(row.approx_date);
    if (!parsed) {
      row.notes = "No parseable date, please review";
      undatedFlagged++;
      rows.push(row);
      continue;
    }
    if (parsed.latest < today) {
      pastDropped++;
      continue;
    }
    if (parsed.earliest > windowEnd) {
      tooFarDropped++;
      continue;
    }
    rows.push(row);
  }

  let inserted = 0;
  if (!dryRun && rows.length > 0) {
    // ignoreDuplicates + unique(dedupe_key) makes re-runs idempotent: existing
    // candidates are skipped, not overwritten.
    const { data, error } = await supabaseAdmin
      .from("discovery_queue")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) logger.error("discovery.insert_failed", { error: error.message });
    else inserted = data?.length ?? 0;
  }

  // In a dry run, leave the source rotation offset untouched too.
  if (!dryRun) await setOffset(nextOffset);

  const result = {
    candidatesFound: found.length,
    uniqueThisRun: byKey.size,
    pastDropped,
    tooFarDropped,
    undatedFlagged,
    keptForInsert: rows.length,
    newInserted: inserted,
    dryRun,
    nextOffset: dryRun ? offset : nextOffset,
  };
  logger.info("discovery.done", result);
  return result;
}

// One-time (re-runnable) cleanup of EXISTING status='discovered' rows. Applies the
// same rolling-window rules as insert: past-dated and too-far-out rows are set to
// 'rejected'; undated rows are kept but flagged for review. Only touches rows that
// are still 'discovered' - approved / ingested / already-rejected rows are left
// alone. Pass dryRun to preview counts without writing.
export async function runDiscoveryCleanup(logger: JobLogger, options: { dryRun?: boolean; now?: Date } = {}) {
  const dryRun = !!options.dryRun;
  const now = options.now ?? new Date();
  const { start: today, end: windowEnd } = discoveryWindow(now);

  const { data, error } = await supabaseAdmin
    .from("discovery_queue")
    .select("id, approx_date, notes")
    .eq("status", "discovered");
  if (error) {
    logger.error("cleanup.fetch_failed", { error: error.message });
    throw new Error(error.message);
  }

  const scanned = data?.length ?? 0;
  const pastIds: string[] = [];
  const farIds: string[] = [];
  const undatedIds: string[] = [];
  let keptInWindow = 0;

  for (const row of data ?? []) {
    const parsed = parseApproxDate(row.approx_date as string | null);
    if (!parsed) {
      undatedIds.push(row.id);
      continue;
    }
    if (parsed.latest < today) pastIds.push(row.id);
    else if (parsed.earliest > windowEnd) farIds.push(row.id);
    else keptInWindow++;
  }

  logger.info("cleanup.start", {
    dryRun,
    scanned,
    windowStart: today.toISOString().slice(0, 10),
    windowEnd: windowEnd.toISOString().slice(0, 10),
    windowMonths: DISCOVERY_WINDOW_MONTHS,
    toRejectPast: pastIds.length,
    toRejectFar: farIds.length,
    toFlagUndated: undatedIds.length,
    keptInWindow,
  });

  if (!dryRun) {
    const stamp = new Date().toISOString();
    if (pastIds.length) {
      await supabaseAdmin
        .from("discovery_queue")
        .update({ status: "rejected", notes: "Rejected by cleanup: past-dated", updated_at: stamp })
        .in("id", pastIds)
        .eq("status", "discovered");
    }
    if (farIds.length) {
      await supabaseAdmin
        .from("discovery_queue")
        .update({ status: "rejected", notes: "Rejected by cleanup: beyond 18-month window", updated_at: stamp })
        .in("id", farIds)
        .eq("status", "discovered");
    }
    if (undatedIds.length) {
      await supabaseAdmin
        .from("discovery_queue")
        .update({ notes: "No parseable date, please review", updated_at: stamp })
        .in("id", undatedIds)
        .eq("status", "discovered");
    }
  }

  const result = {
    scanned,
    rejectedPast: pastIds.length,
    rejectedFar: farIds.length,
    flaggedUndated: undatedIds.length,
    keptInWindow,
    dryRun,
  };
  logger.info("cleanup.done", result);
  return result;
}
