# Discovery + Ingestion Pipeline

Two decoupled jobs sharing Supabase, connected by the `discovery_queue` table,
with a manual approval gate between them.

```
Agent 1 (discovery)  ->  discovery_queue (discovered)
                              |  approve in /admin/candidates
                              v
                         (approved)
                              |
Agent 2 (ingestion)  ->  tiered extract -> validate -> conferences + pricing_tiers (ingested)
```

## Required environment variables (local `.env.local` and Vercel)

| Var | Purpose | Already existed |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase writes | yes |
| `ANTHROPIC_API_KEY` | Claude (discovery + Tier 1) | yes |
| `ADMIN_PASSWORD` | Admin gate | yes |
| `FIRECRAWL_API_KEY` | Firecrawl Tier 2 (JS pricing) | NEW |
| `WORKER_SECRET` | Protects `/api/jobs/*` | NEW |

## One-time setup

1. Run `supabase/migrations/0001_discovery_ingestion_pipeline.sql` in the Supabase SQL editor.
2. Set `FIRECRAWL_API_KEY` and `WORKER_SECRET` in Vercel (all environments) and locally.
3. Enable `pg_cron` and `pg_net` extensions in Supabase, then edit and run
   `supabase/cron_setup.sql` (fill in your domain + `WORKER_SECRET`).

## Manual triggering (first run / testing)

- Admin buttons: open `/admin/candidates`, click "Run discovery" / "Run ingestion"
  (prompts once for `WORKER_SECRET`, kept in sessionStorage).
- Or curl:
  ```
  curl -X POST https://YOUR_DOMAIN/api/jobs/discover -H "x-worker-secret: YOUR_WORKER_SECRET"
  curl -X POST https://YOUR_DOMAIN/api/jobs/ingest   -H "x-worker-secret: YOUR_WORKER_SECRET"
  ```

## Tuning

All in `src/lib/pipeline/config.ts`: `INGEST_BATCH_SIZE`, `DISCOVERY_SOURCES`,
`DISCOVERY_SOURCES_PER_RUN`, `AUTO_APPROVE`, `INGEST_PUBLISH_STATUS`,
`FIRECRAWL_ESCALATE_TO_STEALTH`, recrawl cadence.

Tier 3 (browser-agent) is a stub in `src/lib/pipeline/ingest.ts` (`tier3`).
