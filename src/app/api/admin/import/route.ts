import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdminAuth } from "@/lib/admin-auth";
import { makeDedupeKey, normalizeDomain } from "@/lib/pipeline/dedupe";

// Bulk URL importer. Admin-cookie protected. Parses a pasted blob of URLs,
// validates/normalizes them, dedupes on normalized domain against existing
// conferences AND discovery_queue candidates (the same domain logic the
// discovery pipeline uses), and (on commit) inserts the new ones as APPROVED
// discovery_queue candidates so the existing ingestion job picks them up.
// It does NOT run Firecrawl here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_URLS = 50;

interface Parsed {
  raw: string;
  url: string | null;
  domain: string | null;
  valid: boolean;
  status: "new" | "known" | "duplicate" | "invalid";
  reason?: string;
}

function parseTokens(text: string): string[] {
  return (text || "")
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeUrl(raw: string): { url: string; domain: string } | { error: string } {
  let candidate = raw.trim().replace(/[.,;]+$/, "");
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const u = new URL(candidate);
    if (!u.hostname.includes(".")) return { error: "not a valid domain" };
    return { url: u.href, domain: normalizeDomain(u.href) };
  } catch {
    return { error: "could not parse as a URL" };
  }
}

export async function POST(req: NextRequest) {
  const authError = checkAdminAuth(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { text, mode } = await req.json();
  const tokens = parseTokens(text || "");
  const truncated = tokens.length > MAX_URLS;
  const used = tokens.slice(0, MAX_URLS);

  // Known domains from existing data.
  const [{ data: confs }, { data: cands }] = await Promise.all([
    supabaseAdmin.from("conferences").select("source_url, registration_url"),
    supabaseAdmin.from("discovery_queue").select("url"),
  ]);
  const known = new Set<string>();
  for (const c of confs ?? []) {
    if (c.source_url) known.add(normalizeDomain(c.source_url));
    if (c.registration_url) known.add(normalizeDomain(c.registration_url));
  }
  for (const c of cands ?? []) if (c.url) known.add(normalizeDomain(c.url));

  const seenInPaste = new Set<string>();
  const parsed: Parsed[] = used.map((raw) => {
    const norm = normalizeUrl(raw);
    if ("error" in norm) return { raw, url: null, domain: null, valid: false, status: "invalid", reason: norm.error };
    if (known.has(norm.domain)) return { raw, url: norm.url, domain: norm.domain, valid: true, status: "known" };
    if (seenInPaste.has(norm.domain)) return { raw, url: norm.url, domain: norm.domain, valid: true, status: "duplicate", reason: "repeated in this paste" };
    seenInPaste.add(norm.domain);
    return { raw, url: norm.url, domain: norm.domain, valid: true, status: "new" };
  });

  const counts = {
    parsed: parsed.length,
    invalid: parsed.filter((p) => p.status === "invalid").length,
    known: parsed.filter((p) => p.status === "known").length,
    duplicate: parsed.filter((p) => p.status === "duplicate").length,
    new: parsed.filter((p) => p.status === "new").length,
  };

  if (mode !== "commit") {
    return NextResponse.json({ ok: true, mode: "preview", truncated, maxUrls: MAX_URLS, counts, parsed });
  }

  // Commit: insert the new, valid, unique ones as approved candidates.
  const rows = parsed
    .filter((p) => p.status === "new" && p.url)
    .map((p) => ({
      name: p.domain!,
      url: p.url!,
      source: "manual_bulk",
      status: "approved",
      dedupe_key: makeDedupeKey({ url: p.url }),
      updated_at: new Date().toISOString(),
    }));

  let inserted = 0;
  if (rows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("discovery_queue")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = data?.length ?? 0;
  }

  return NextResponse.json({ ok: true, mode: "commit", truncated, maxUrls: MAX_URLS, counts, queued: inserted, parsed });
}
