// Pricing regression check. Runs the grounding gate, grid-collapse, discount
// deadlines, non-admission filter and academic detector against COMMITTED
// FIXTURES (raw Firecrawl output saved under scripts/fixtures), so it consumes
// zero Firecrawl credits and is deterministic (no network, no page variance).
//
//   node scripts/pricing-regression.ts            run once from fixtures
//   node scripts/pricing-regression.ts 2          run twice from fixtures and diff
//   FIRECRAWL_API_KEY=... node scripts/pricing-regression.ts --refresh
//                                                 re-fetch live pages and rewrite fixtures
//
// The evaluation date is pinned (NOW) so the "current window" and discount
// deadlines are stable regardless of when the check is run.

import { EXTRACTION_JSON_SCHEMA, EXTRACTION_JSON_PROMPT, normalizeExtraction, collapsePricingTiers } from "../src/lib/pipeline/extract-schema.ts";
import { groundPricingTiers, applyDiscountDeadlines } from "../src/lib/pipeline/grounding.ts";
import { detectAcademicSignals, isAcademicLikely } from "../src/lib/pipeline/academic.ts";
import fs from "node:fs";
import path from "node:path";

const NOW = new Date("2026-08-26T00:00:00Z"); // pinned evaluation date
const FIX_DIR = path.join(import.meta.dirname, "fixtures");
const SEEDS = [
  { id: "ai-forum", label: "AI & ML Forum (academic grid)", url: "https://artificialintelligence-forum.com/registration.php" },
  { id: "humanx", label: "HumanX Europe (via finder)", url: "https://www.humanx.co/europe" },
  { id: "worldsummit", label: "World Summit AI", url: "https://worldsummit.ai" },
  { id: "bigdata", label: "Big Data London", url: "https://bigdataldn.com" },
];

// ---- pure evaluation (no network) -------------------------------------------
function evaluate(fx: any) {
  const g = groundPricingTiers(normalizeExtraction(fx.json)?.pricing_tiers ?? [], fx.markdown);
  const collapsed = collapsePricingTiers(g.tiers, fx.markdown, NOW);
  const tiers = applyDiscountDeadlines(collapsed, fx.markdown, { conferenceStart: fx.start, now: NOW });
  const signals = detectAcademicSignals({ pageText: fx.markdown, tierNames: tiers.map((t: any) => t.name), excludedNames: g.report.excluded.map((e: any) => e.name), conferenceName: "" });
  return { tiers, academic: isAcademicLikely(signals) ? signals : null, excluded: g.report.excluded, resolvedUrl: fx.resolvedUrl, start: fx.start };
}
const tierLine = (t: any) => `${t.name} | ${t.currency || "?"} ${t.price === 0 ? "Free" : t.price}${t.price_after_deadline != null ? ` -> then ${t.price_after_deadline}` : ""}${t.deadline ? ` (after ${t.deadline})` : ""}`;
const tierKey = (t: any) => `${t.name}=${t.price}/${t.price_after_deadline ?? "-"}@${t.deadline ?? "-"}`;
function printResult(label: string, r: any) {
  console.log(`\n== ${label} ==`);
  console.log(`resolved: ${r.resolvedUrl}${r.start ? ` | start=${r.start}` : ""}`);
  console.log(`ACADEMIC: ${r.academic ? "LIKELY -> " + r.academic.join("; ") : "no"}`);
  console.log(`tiers (${r.tiers.length}):`);
  for (const t of r.tiers) console.log(`  - ${tierLine(t)}`);
  if (r.excluded.length) console.log(`  excluded: ${r.excluded.map((e: any) => `${e.name} [${e.keyword}]`).join("; ")}`);
}
function loadFixture(id: string): any | null {
  try { return JSON.parse(fs.readFileSync(path.join(FIX_DIR, `${id}.json`), "utf8")); } catch { return null; }
}

// ---- live refresh (costs credits) -------------------------------------------
const KEY = process.env.FIRECRAWL_API_KEY;
const PRICING_KW = ["tickets", "ticket", "registration", "register", "pricing", "prices", "passes", "pass", "book", "buy", "rates", "fees"];
const STRONG = new Set(["tickets", "ticket", "registration", "register", "pricing", "prices"]);
const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
const isDedicated = (u: string) => { try { return /(?:register|registration|tickets?|pricing|prices|passes)/i.test(new URL(u).pathname); } catch { return false; } };
function rankLinks(links: string[], baseUrl: string): string[] {
  const baseHost = hostOf(baseUrl), seen = new Set<string>(), scored: { url: string; score: number }[] = [];
  for (const raw of links || []) {
    if (!raw || typeof raw !== "string" || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
    let abs: string; try { abs = new URL(raw, baseUrl).href.split("#")[0]; } catch { continue; }
    if (!/^https?:\/\//i.test(abs) || seen.has(abs)) continue;
    let score = 0; const low = abs.toLowerCase();
    for (const kw of PRICING_KW) if (low.includes(kw)) score += STRONG.has(kw) ? 3 : 1;
    if (score === 0) continue;
    if (hostOf(abs) === baseHost) score += 5;
    seen.add(abs); scored.push({ url: abs, score });
  }
  scored.sort((a, b) => b.score - a.score || a.url.length - b.url.length);
  return scored.map((s) => s.url);
}
async function scrape(url: string, proxy: string, withLinks = false) {
  const formats: any[] = ["markdown", { type: "json", schema: EXTRACTION_JSON_SCHEMA, prompt: EXTRACTION_JSON_PROMPT }];
  if (withLinks) formats.push("links");
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ url, onlyMainContent: true, proxy, formats, timeout: 60000 }), signal: AbortSignal.timeout(90000),
  });
  const d = (await res.json())?.data ?? {};
  const links = (Array.isArray(d.links) ? d.links : []).map((l: any) => (typeof l === "string" ? l : l?.url)).filter(Boolean);
  return { json: d.json ?? d.extract ?? null, markdown: typeof d.markdown === "string" ? d.markdown : "", links };
}
async function map(url: string): Promise<string[]> {
  const res = await fetch("https://api.firecrawl.dev/v2/map", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ url, limit: 150 }), signal: AbortSignal.timeout(90000) });
  const data = await res.json();
  const raw = Array.isArray(data?.links) ? data.links : Array.isArray(data?.data?.links) ? data.data.links : [];
  return raw.map((l: any) => (typeof l === "string" ? l : l?.url)).filter(Boolean);
}
const groundOf = (s: any) => groundPricingTiers(normalizeExtraction(s.json)?.pricing_tiers ?? [], s.markdown);
async function findPricing(url: string) {
  const tried = [url];
  let s = await scrape(url, "basic", true);
  let g = groundOf(s);
  if (g.tiers.length > 0) {
    if (!isDedicated(url)) {
      const strong = rankLinks(s.links, url).find((u) => isDedicated(u) && hostOf(u) === hostOf(url));
      if (strong) { const cs = await scrape(strong, "basic"); if (groundOf(cs).tiers.length > g.tiers.length) return { s: cs, from: strong }; }
    }
    return { s, from: url };
  }
  for (const c of rankLinks(s.links, url).slice(0, 2)) { tried.push(c); const cs = await scrape(c, "basic"); if (groundOf(cs).tiers.length) return { s: cs, from: c }; }
  for (const c of rankLinks(await map(url), url).filter((u) => !tried.includes(u)).slice(0, 2)) { const cs = await scrape(c, "basic"); if (groundOf(cs).tiers.length) return { s: cs, from: c }; }
  s = await scrape(url, "stealth", true);
  return { s, from: `${url} (stealth)` };
}
async function refresh() {
  if (!KEY) { console.error("FIRECRAWL_API_KEY required for --refresh"); process.exit(1); }
  fs.mkdirSync(FIX_DIR, { recursive: true });
  for (const seed of SEEDS) {
    const { s, from } = await findPricing(seed.url);
    const start = normalizeExtraction(s.json)?.start_date || null;
    const fx = { id: seed.id, label: seed.label, seedUrl: seed.url, resolvedUrl: from, start, json: s.json, markdown: s.markdown, capturedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(FIX_DIR, `${seed.id}.json`), JSON.stringify(fx, null, 2));
    console.log(`refreshed ${seed.id}: resolved ${from}, ${(s.markdown || "").length} md chars`);
  }
}

// ---- entrypoint -------------------------------------------------------------
const arg = process.argv[2];
if (arg === "--refresh") {
  await refresh();
} else {
  const fixtures = SEEDS.map((seed) => ({ seed, fx: loadFixture(seed.id) }));
  const missing = fixtures.filter((f) => !f.fx).map((f) => f.seed.id);
  if (missing.length) { console.error(`Missing fixtures: ${missing.join(", ")}. Run: FIRECRAWL_API_KEY=... node scripts/pricing-regression.ts --refresh`); process.exit(1); }
  const twice = arg === "2";
  const runA = fixtures.map((f) => evaluate(f.fx));
  if (!twice) {
    fixtures.forEach((f, i) => printResult(f.seed.label, runA[i]));
  } else {
    console.log("########## RUN 1 ##########");
    fixtures.forEach((f, i) => printResult(f.seed.label, runA[i]));
    console.log("\n########## RUN 2 ##########");
    const runB = fixtures.map((f) => evaluate(f.fx));
    fixtures.forEach((f, i) => printResult(f.seed.label, runB[i]));
    console.log("\n########## DIFF (tiers present in one run only) ##########");
    fixtures.forEach((f, i) => {
      const a = new Set(runA[i].tiers.map(tierKey)), b = new Set(runB[i].tiers.map(tierKey));
      const onlyA = [...a].filter((k) => !b.has(k)), onlyB = [...b].filter((k) => !a.has(k));
      console.log(`${f.seed.label}: run1=${runA[i].tiers.length} run2=${runB[i].tiers.length}` + (onlyA.length || onlyB.length ? ` | ONLY RUN1: ${onlyA.join(", ") || "-"} | ONLY RUN2: ${onlyB.join(", ") || "-"}` : " | identical"));
    });
  }
}
