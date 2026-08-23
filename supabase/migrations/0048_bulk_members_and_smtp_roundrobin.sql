-- ============================================================================
-- KL CIIE Platform V2 — 0048: bulk add members + SMTP round-robin rotation
--
-- 1) Bulk Add Members (Admin → People):
--    A new Edge Function (bulk-create-members, service role) creates auth
--    accounts from an uploaded Excel sheet and then activates each profile.
--    Updating protected profile fields (status, student_id …) from the service
--    role was blocked by the protect_profile_fields trigger (is_admin() is
--    false for the service role), so that trigger now lets requests carrying
--    the `service_role` JWT claim through. End users are unaffected — they can
--    still never touch role/status/email/ciie_id themselves.
--
-- 2) SMTP round-robin rotation:
--    Instead of always sending from account #1 and only failing over on
--    errors, sends now rotate across every active Gmail SMTP account
--    (1st mail → 1st account, 2nd mail → 2nd account, … looping back to #1).
--    smtp_rotation_state holds a single global counter; the send-recruit-email
--    Edge Function reads + increments it atomically per send. RLS is enabled
--    with no policies, so only the service role can touch it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Allow the service role (Edge Functions) past protected-field checks
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Edge Functions authenticate with the service_role key; they run trusted
  -- server-side flows (bulk member import). Everyone else keeps the limits.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if not public.is_admin() and (
      new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.mfa_enabled is distinct from old.mfa_enabled
      or new.mfa_setup_required is distinct from old.mfa_setup_required
      or new.email is distinct from old.email
      or new.ciie_id is distinct from old.ciie_id
  ) then
    raise exception 'Cannot modify protected profile fields';
  end if;
  if public.is_admin() and not public.is_super_admin() and old.mfa_enabled and not new.mfa_enabled then
    raise exception 'Only Super Admin can disable MFA';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Global rotation counter for the SMTP pool (service-role only)
-- ---------------------------------------------------------------------------
create table if not exists public.smtp_rotation_state (
  id boolean primary key default true check (id),
  next_index bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.smtp_rotation_state (id) values (true) on conflict do nothing;

drop trigger if exists touch_smtp_rotation_state on public.smtp_rotation_state;
create trigger touch_smtp_rotation_state before update on public.smtp_rotation_state
  for each row execute function public.touch_updated_at();

alter table public.smtp_rotation_state enable row level security;
-- No policies: anon/authenticated have no access; only the service role
-- (Edge Functions) bypasses RLS to read/bump the counter.
