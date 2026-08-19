-- ---------------------------------------------------------------------------
-- 0042: MFA only for super_admin (not main_admin) at the DB layer
--
-- Previously is_super_admin() included main_admin, so the restrictive
-- MFA RLS policies also blocked main_admin without aal2. Now we introduce
-- is_mfa_required_role() which only matches 'super_admin', and update
-- admin_aal2() + every restrictive policy to use it.
--
-- Also fixes is_admin() which lost 'main_admin' in migration 0032,
-- causing main_admin to be treated as non-admin in RPCs like
-- admin_get_event_stats.
-- ---------------------------------------------------------------------------

-- 0) Fix is_admin: re-add 'main_admin' which was dropped in 0032
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.status = 'active'
      and p.role in (
        'super_admin', 'main_admin', 'event_admin', 'member_admin', 'content_admin',
        'gallery_admin', 'reports_admin', 'attendance_coordinator', 'mail_admin'
      )
  );
$$;

-- 1) New function: true only when the caller is an active super_admin
create or replace function public.is_mfa_required_role()
returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and status = 'active'
  )
$$;

-- 2) Update admin_aal2 to gate only super_admin
create or replace function public.admin_aal2()
returns boolean
language sql stable set search_path = ''
as $$
  select public.is_admin()
     and (not public.is_mfa_required_role() or (auth.jwt() ->> 'aal') = 'aal2');
$$;

-- 3) Drop and recreate every restrictive policy that referenced is_super_admin()
--    Patterns:
--      restrictive SELECT  → USING ((SELECT auth.jwt()->>'aal') = 'aal2' OR NOT public.is_super_admin())
--      restrictive UPDATE  → USING … + WITH CHECK …
--    We use a DO block to find and replace them all at once.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'RESTRICTIVE'
      AND qual LIKE '%is_super_admin%'
  LOOP
    -- Drop the existing policy
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    -- Recreate with is_mfa_required_role()
    IF r.cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT auth.jwt() ->> ''aal'') = ''aal2'' OR NOT public.is_mfa_required_role())',
        r.policyname, r.schemaname, r.tablename
      );
    ELSIF r.cmd = 'UPDATE' AND r.with_check IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT auth.jwt() ->> ''aal'') = ''aal2'' OR NOT public.is_mfa_required_role()) WITH CHECK ((SELECT auth.jwt() ->> ''aal'') = ''aal2'' OR NOT public.is_mfa_required_role())',
        r.policyname, r.schemaname, r.tablename
      );
    END IF;
  END LOOP;
END $$;

-- 4) Also update the 0009 self-read policies on profiles that used is_super_admin()
--    These have the pattern: USING (auth.uid() = id OR (SELECT ...) OR NOT is_super_admin())
--    Replace is_super_admin() with is_mfa_required_role() in those too.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'RESTRICTIVE'
      AND (qual LIKE '%is_super_admin%' OR (with_check IS NOT NULL AND with_check LIKE '%is_super_admin%'))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    IF r.cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (%s)',
        r.policyname, r.schemaname, r.tablename,
        replace(r.qual, 'public.is_super_admin()', 'public.is_mfa_required_role()')
      );
    ELSIF r.cmd = 'UPDATE' AND r.with_check IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
        r.policyname, r.schemaname, r.tablename,
        replace(r.qual, 'public.is_super_admin()', 'public.is_mfa_required_role()'),
        replace(r.with_check, 'public.is_super_admin()', 'public.is_mfa_required_role()')
      );
    END IF;
  END LOOP;
END $$;

-- 5) Grant access to the new function
grant execute on function public.is_mfa_required_role() to authenticated;
