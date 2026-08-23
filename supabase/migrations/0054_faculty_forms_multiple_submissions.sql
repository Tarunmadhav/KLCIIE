-- ============================================================================
-- KL CIIE Platform V2 — 0054: Faculty forms — multiple submissions option
--
-- 1) faculty_forms.allow_multiple — when enabled, a faculty member may submit
--    the same form any number of times; every submission is kept as its own
--    record for tracking.
-- 2) Drops the one-submission-per-faculty unique constraint so repeat
--    submissions can be stored.
-- ============================================================================

alter table public.faculty_forms
  add column if not exists allow_multiple boolean not null default false;

alter table public.faculty_form_submissions
  drop constraint if exists faculty_form_submissions_form_id_member_id_key;
