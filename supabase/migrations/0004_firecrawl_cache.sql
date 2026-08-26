-- ============================================================
-- Raw-page-text cache for Firecrawl fetches. A scrape of a URL younger than the
-- freshness window (config FIRECRAWL_CACHE_DAYS, default 7) is reused instead of
-- re-fetching, saving Firecrawl credits. Admin Re-scrape forces a fresh fetch.
-- The pipeline degrades gracefully if this table is absent (cache simply misses),
-- so this migration is optional but recommended. Run once in the Supabase SQL editor.
-- ============================================================

create table if not exists public.firecrawl_cache (
  url        text primary key,
  markdown   text,
  json       jsonb,
  links      jsonb,
  fetched_at timestamptz not null default now()
);

-- Prune helper: index for age-based cleanup if desired later.
create index if not exists firecrawl_cache_fetched_at_idx on public.firecrawl_cache (fetched_at);
