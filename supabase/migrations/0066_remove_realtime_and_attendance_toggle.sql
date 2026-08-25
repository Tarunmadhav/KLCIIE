-- ============================================================================
-- KL CIIE Platform V2 — 0066: remove unused realtime + attendance toggle
-- Drop platform_settings, recruit_applications, recruit_evaluations from the
-- supabase_realtime publication (no longer needed). Keep attendance in the
-- publication but make it opt-in via a new use_attendance_realtime setting.
-- ============================================================================

-- Remove tables from realtime publication (ignore if not present)
DO $$
BEGIN
  IF exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'platform_settings') then
    ALTER PUBLICATION supabase_realtime DROP TABLE public.platform_settings;
  END IF;
  IF exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recruit_applications') then
    ALTER PUBLICATION supabase_realtime DROP TABLE public.recruit_applications;
  END IF;
  IF exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recruit_evaluations') then
    ALTER PUBLICATION supabase_realtime DROP TABLE public.recruit_evaluations;
  END IF;
END
$$;

-- Add toggle so the admin can enable/disable attendance realtime per-platform
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS use_attendance_realtime boolean not null default true;
