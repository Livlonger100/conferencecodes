// Pricing regression check. Re-scrapes a fixed list of URLs through the same
// grounding + grid-collapse + exclusion + academic-signal logic the pipeline
// uses, and prints the resulting tiers as plain text, so pipeline changes can be
// verified against known-good output in one command:
//
//   FIRECRAWL_API_KEY=... node scripts/pricing-regression.ts
//
// It mirrors the pricing-page finder (given URL -> ranked links -> map -> stealth)
// so homepage seeds resolve to their tickets/registration page.

import { EXTRACTION_JSON_SCHEMA, EXTRACTION_JSON_PROMPT, normalizeExtraction, collapsePricingTiers } from "../src/lib/pipeline/extract-schema.ts";
import { groundPricingTiers, formatGroundingReport } from "../src/lib/pipeline/grounding.ts";
import { detectAcademicSignals, isAcademicLikely } from "../src/lib/pipeline/academic.ts";

const KEY = process.env.FIRECRAWL_API_KEY;
const SEEDS = [
  { label: "AI & ML Forum (academic grid)", url: "https://artificialintelligence-forum.com/registration.php" },
  { label: "HumanX Europe", url: "https://www.humanx.co/europe/register" },
  { label: "World Summit AI", url: "https://worldsummit.ai" },
  { label: "Big Data London", url: "https://bigdataldn.com" },
];
const PRICING_KW = ["tickets", "ticket", "registration", "register", "pricing", "prices", "passes", "pass", "book", "buy", "rates", "fees"];
const STRONG = new Set(["tickets", "ticket", "registration", "register", "pricing", "prices"]);
const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

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
  const res = await fetch("https://api.firecrawl.dev/v2/map", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ url, limit: 150 }), signal: AbortSignal.timeout(90000),
  });
  const data = await res.json();
  const raw = Array.isArray(data?.links) ? data.links : Array.isArray(data?.data?.links) ? data.data.links : [];
  return raw.map((l: any) => (typeof l === "string" ? l : l?.url)).filter(Boolean);
}
const groundOf = (s: any) => groundPricingTiers(normalizeExtraction(s.json)?.pricing_tiers ?? [], s.markdown);

async function findPricing(url: string) {
  const tried = [url];
  let s = await scrape(url, "basic", true);
  let g = groundOf(s);
  if (g.tiers.length) return { g, s, from: url };
  for (const c of rankLinks(s.links, url).slice(0, 2)) { tried.push(c); const cs = await scrape(c, "basic"); const cg = groundOf(cs); if (cg.tiers.length) return { g: cg, s: cs, from: c }; }
  for (const c of rankLinks(await map(url), url).filter((u) => !tried.includes(u)).slice(0, 2)) { const cs = await scrape(c, "basic"); const cg = groundOf(cs); if (cg.tiers.length) return { g: cg, s: cs, from: c }; }
  s = await scrape(url, "stealth", true); g = groundOf(s);
  return { g, s, from: `${url} (stealth)` };
}

for (const seed of SEEDS) {
  const { g, s, from } = await findPricing(seed.url);
  const tiers = collapsePricingTiers(g.tiers, s.markdown);
  const signals = detectAcademicSignals({ pageText: s.markdown, tierNames: tiers.map((t: any) => t.name), excludedNames: g.report.excluded.map((e: any) => e.name), conferenceName: "" });
  console.log(`\n================ ${seed.label} ================`);
  console.log(`pricing page: ${from}`);
  console.log(`ACADEMIC: ${isAcademicLikely(signals) ? "LIKELY -> " + signals.join("; ") : "no"}`);
  console.log(`tiers (${tiers.length}):`);
  for (const t of tiers) console.log(`  - ${t.name} | ${t.currency || "?"} ${t.price === 0 ? "Free" : t.price}${t.price_after_deadline != null ? ` -> then ${t.price_after_deadline}` : ""}${t.deadline ? ` (after ${t.deadline})` : ""}`);
  if (g.report.excluded.length) console.log(`excluded: ${g.report.excluded.map((e: any) => `${e.name} [${e.keyword}]`).join("; ")}`);
  if (g.report.dropped.length) console.log(`dropped: ${g.report.dropped.map((d: any) => `${d.name} [${d.reason}]`).join("; ")}`);
}
