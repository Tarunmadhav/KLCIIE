-- ============================================================================
-- KL CIIE Platform V2 — 0036: platform_settings realtime
-- Add platform_settings to the supabase_realtime publication so the AMTPS
-- display-mode toggle (amtps_mode) propagates instantly to every open tab
-- (the SettingsProvider subscribes to UPDATE events on this table).
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'platform_settings'
  ) then
    alter publication supabase_realtime add table public.platform_settings;
  end if;
end
$$;
