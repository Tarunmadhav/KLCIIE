-- ============================================================================
-- KL CIIE Platform V2 — 0025: live attendance QR refresh
-- Add the attendance table to the supabase_realtime publication so the
-- member's QR page receives a push the moment a CIIE member marks them
-- present. The page then refetches get_my_event_attendance_qr and the
-- checkmark + rotated QR code update immediately — no manual refresh needed.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attendance'
  ) then
    alter publication supabase_realtime add table public.attendance;
  end if;
end
$$;
