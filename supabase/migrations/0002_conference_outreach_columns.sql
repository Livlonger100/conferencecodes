-- ============================================================
-- Adds the organizer-contact / outreach / affiliate columns the admin
-- conference form and its save handler (toDbFormat) expect on `conferences`.
-- All additive, nullable, text. Idempotent: only `affiliate_url` is actually
-- missing today; the rest already exist and are no-ops here.
-- Run once in the Supabase SQL editor.
-- ============================================================

alter table public.conferences add column if not exists contact_name     text;
alter table public.conferences add column if not exists contact_role     text;
alter table public.conferences add column if not exists contact_email    text;
alter table public.conferences add column if not exists contact_phone    text;
alter table public.conferences add column if not exists contact_website  text;
alter table public.conferences add column if not exists outreach_status  text;
alter table public.conferences add column if not exists affiliate        text;
alter table public.conferences add column if not exists affiliate_details text;
alter table public.conferences add column if not exists affiliate_url    text;
alter table public.conferences add column if not exists outreach_notes   text;
