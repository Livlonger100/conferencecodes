-- ============================================================
-- Discovery candidate context + editable discovery sources.
-- Additive and nullable; no existing columns/tables changed.
-- Run once in the Supabase SQL editor.
-- ============================================================

-- Task 1: decision-helper fields on candidates (approximate, from web search).
alter table public.discovery_queue add column if not exists full_name text;
alter table public.discovery_queue add column if not exists short_description text;

-- Task 2: editable discovery sources, so search queries live in the DB not code.
create table if not exists public.discovery_sources (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'search' check (kind in ('search','directory')),
  label      text not null,
  query      text,   -- for search sources; may contain the {YEARS} placeholder
  url        text,   -- for directory sources
  region     text,
  enabled    boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed with the current config defaults, only if the table is empty.
insert into public.discovery_sources (kind, label, query, url, region, enabled, sort_order)
select * from (values
  ('search','AI conf North America','major AI conferences {YEARS}',null,'North America',true,0),
  ('search','AI conf Europe','AI and machine learning conferences {YEARS} Europe',null,'Europe',true,1),
  ('search','AI conf Asia','artificial intelligence conferences {YEARS} Asia Singapore Japan India',null,'Asia',true,2),
  ('search','AI conf Middle East + Africa','AI summit {YEARS} Dubai Riyadh Africa',null,'Middle East / Africa',true,3),
  ('search','Generative / agentic AI','generative AI and AI agents conference {YEARS} worldwide',null,'Global',true,4),
  ('search','MLOps / applied AI','MLOps and applied machine learning conference {YEARS}',null,'Global',true,5),
  ('directory','tryolabs directory',null,'https://tryolabs.com/blog/machine-learning-deep-learning-conferences','Global',true,6),
  ('directory','aiconferences.info',null,'https://aiconferences.info','Global',true,7)
) as v(kind,label,query,url,region,enabled,sort_order)
where not exists (select 1 from public.discovery_sources);
