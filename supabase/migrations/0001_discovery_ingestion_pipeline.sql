-- ============================================================
-- ConferenceCodes discovery + ingestion pipeline schema
-- Run this once in the Supabase SQL editor (or via the Supabase CLI).
-- Safe to re-run: uses IF NOT EXISTS throughout.
-- ============================================================

-- 1) Discovery queue: candidate conferences found by Agent 1 -----------------
create table if not exists public.discovery_queue (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  url           text not null,
  approx_date   text,
  city          text,
  country       text,
  source        text,                       -- where the candidate was found
  status        text not null default 'discovered'
                check (status in ('discovered','approved','rejected','ingested','failed')),
  dedupe_key    text not null,              -- normalized name+date+city+url-domain
  conference_id uuid references public.conferences(id) on delete set null,
  tier_used     text,                       -- last ingestion tier attempted
  notes         text,                       -- notes / error reason
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Idempotency: re-running discovery must not create duplicate candidates.
create unique index if not exists discovery_queue_dedupe_key_idx
  on public.discovery_queue (dedupe_key);
create index if not exists discovery_queue_status_idx
  on public.discovery_queue (status);

-- 2) Pipeline state: small key/value store (e.g. discovery source rotation) ---
create table if not exists public.pipeline_state (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3) Extend pricing_tiers to hold early-bird start/end windows ----------------
-- The existing `deadline` column stays as the generic price-change / registration
-- deadline. These additive nullable columns capture the early-bird window.
alter table public.pricing_tiers add column if not exists early_bird_start date;
alter table public.pricing_tiers add column if not exists early_bird_end   date;

-- 4) Recrawl scheduling on conferences ---------------------------------------
alter table public.conferences add column if not exists next_recrawl_at timestamptz;
create index if not exists conferences_next_recrawl_idx
  on public.conferences (next_recrawl_at);
