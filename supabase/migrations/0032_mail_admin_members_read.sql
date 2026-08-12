-- ---------------------------------------------------------------------------
-- 0032: Guarantee mail admins can read every profile (including super admins)
--
-- The admin Members page is read-only for mail admins, but RLS must let them
-- see all profiles — including the super admin's row. This recreates is_admin()
-- to be sure 'mail_admin' is included and adds an explicit permissive read
-- policy for mail admins so the row can never be hidden by a stale function.
-- NOTE: functions with default args must be referenced with their full
-- signature (or an explicit argument) in GRANT / CREATE POLICY expressions.
-- ---------------------------------------------------------------------------

create or replace function public.is_mail_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.status = 'active' and p.role = 'mail_admin'
  );
$$;

grant execute on function public.is_mail_admin(uuid) to authenticated;

-- Recreate is_admin() (idempotent) to make sure 'mail_admin' is in the admin list.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.status = 'active'
      and p.role in (
        'super_admin', 'event_admin', 'member_admin', 'content_admin',
        'gallery_admin', 'reports_admin', 'attendance_coordinator', 'mail_admin'
      )
  );
$$;

-- Explicit read-all policy for mail admins (covers the super admin row too).
drop policy if exists profiles_mail_admin_read on public.profiles;
create policy profiles_mail_admin_read on public.profiles
  for select to authenticated
  using (public.is_mail_admin(auth.uid()) or public.is_admin(auth.uid()));
