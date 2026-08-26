-- ---------------------------------------------------------------------------
-- 0068: Cleanup orphaned profiles
--
-- When the bulk-delete Edge Function removes an auth user via GoTrue admin
-- API, the FK cascade (profiles.id -> auth.users.id ON DELETE CASCADE)
-- sometimes fails to fire, leaving an orphaned profile row.  Orphaned
-- profiles cause the bulk-add duplicate check to incorrectly skip emails
-- that should be re-creatable.
--
-- This migration removes every profile whose id has no matching row in
-- auth.users, and also deletes the corresponding member_privacy_settings
-- and member_qr_codes rows (which cascade from profiles).
-- ---------------------------------------------------------------------------

-- 1) Log how many orphans we are about to remove (for the audit trail).
insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
select
  null,
  'Orphaned Profiles Cleanup',
  'cleanup',
  null,
  jsonb_build_object(
    'orphan_count', (
      select count(*)
      from public.profiles p
      where not exists (select 1 from auth.users u where u.id = p.id)
    )
  )
where exists (
  select 1
  from public.profiles p
  where not exists (select 1 from auth.users u where u.id = p.id)
);

-- 2) Delete orphaned profiles (and their cascaded rows).
delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);
