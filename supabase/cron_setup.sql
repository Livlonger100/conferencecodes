-- ============================================================
-- Scheduling for the discovery + ingestion workers using pg_cron + pg_net.
-- This calls the app's protected worker endpoints on a schedule. No external
-- vendor (Trigger.dev / Inngest) is involved.
--
-- BEFORE RUNNING:
--   1. In Supabase dashboard -> Database -> Extensions, enable `pg_cron` and `pg_net`.
--   2. Replace YOUR_APP_DOMAIN with your deployed domain (e.g. conferencecodes.com
--      or the Vercel preview/prod URL for this branch).
--   3. Replace YOUR_WORKER_SECRET with the exact value of the WORKER_SECRET env var
--      you set in Vercel. (It is only stored inside the cron job definition, which
--      is not publicly readable.)
--
-- Cadence rationale:
--   - Ingestion ticks OFTEN (every 2 min) but only processes a small batch each
--     time, draining the approved queue without ever hitting the function timeout.
--   - Discovery runs a few times a day; it rotates through the source list.
-- ============================================================

-- Ingestion: every 2 minutes -------------------------------------------------
select cron.schedule(
  '3c-ingest',
  '*/2 * * * *',
  $$
    select net.http_post(
      url     := 'https://YOUR_APP_DOMAIN/api/jobs/ingest',
      headers := jsonb_build_object('Content-Type','application/json','x-worker-secret','YOUR_WORKER_SECRET'),
      body    := '{}'::jsonb
    );
  $$
);

-- Discovery: 4x per day (00:15, 06:15, 12:15, 18:15 UTC) ----------------------
select cron.schedule(
  '3c-discover',
  '15 0,6,12,18 * * *',
  $$
    select net.http_post(
      url     := 'https://YOUR_APP_DOMAIN/api/jobs/discover',
      headers := jsonb_build_object('Content-Type','application/json','x-worker-secret','YOUR_WORKER_SECRET'),
      body    := '{}'::jsonb
    );
  $$
);

-- Useful management commands:
--   select * from cron.job;                       -- list scheduled jobs
--   select cron.unschedule('3c-ingest');          -- remove a job
--   select * from cron.job_run_details order by start_time desc limit 20;  -- history
