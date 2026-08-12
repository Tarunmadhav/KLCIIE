-- ============================================================================
-- KL CIIE Platform V2 — 0009: allow self-read/self-update of profile before MFA
-- The restrictive MFA policies previously blocked a super_admin from reading
-- their OWN profile until aal2, which made it impossible for the app to detect
-- the admin role and route the user to /auth/mfa-setup in the first place.
-- Self rows are now always readable/updatable; cross-user admin access still
-- requires aal2.
-- ============================================================================

drop policy if exists profiles_admin_read_mfa on public.profiles;
create policy profiles_admin_read_mfa on public.profiles
  as restrictive for select to authenticated
  using (
    auth.uid() = id
    or (select auth.jwt() ->> 'aal') = 'aal2'
    or not public.is_super_admin()
  );

drop policy if exists profiles_admin_update_mfa on public.profiles;
create policy profiles_admin_update_mfa on public.profiles
  as restrictive for update to authenticated
  using (
    auth.uid() = id
    or (select auth.jwt() ->> 'aal') = 'aal2'
    or not public.is_super_admin()
  )
  with check (
    auth.uid() = id
    or (select auth.jwt() ->> 'aal') = 'aal2'
    or not public.is_super_admin()
  );
