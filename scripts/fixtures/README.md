# Pricing regression fixtures

Each `<seed-id>.json` file holds the raw Firecrawl output for one regression URL,
captured once and committed so the regression check runs against fixed text and
consumes **zero Firecrawl credits**:

```json
{
  "id": "humanx",
  "label": "HumanX Europe (via finder)",
  "seedUrl": "https://www.humanx.co/europe",
  "resolvedUrl": "https://www.humanx.co/europe/register",
  "start": "2026-09-...",
  "json": { "pricing_tiers": [ ... ] },
  "markdown": "raw scraped page text ...",
  "capturedAt": "2026-..."
}
```

The grounding gate, grid-collapse, discount-deadline rule, non-admission filter
and academic detector all operate purely on `json` + `markdown`, so replaying the
fixtures is deterministic and network-free.

## Commands

- `node scripts/pricing-regression.ts` runs once from these fixtures (0 credits).
- `node scripts/pricing-regression.ts 2` runs twice and diffs (proves the logic is
  deterministic on fixed input).
- `FIRECRAWL_API_KEY=... node scripts/pricing-regression.ts --refresh` re-fetches
  the live pages and rewrites the fixtures. Run this only when a source site has
  genuinely changed (it spends credits).

The evaluation date is pinned inside the script (`NOW`) so the current pricing
window and discount deadlines stay stable regardless of when the check runs.
