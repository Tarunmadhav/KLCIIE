-- ============================================================================
-- KL CIIE Platform V2 — 0007: recruitment, settings, super-admin-only MFA
-- 1) platform_settings (single row): public signup toggle, email domain
--    restriction and the two GD/Interview dates used for recruitment.
-- 2) profiles: adds recruitment statuses ('pending', 'recruit') + interview_batch.
-- 3) event_team_members: adds hours_worked.
-- 4) handle_new_user: new signups become 'pending' recruits with an
--    alternating interview batch (1st -> Day 1, 2nd -> Day 2, ...).
-- 5) admin_aal2(): only super_admin is now MFA-gated. Every other role
--    (including the other admin roles) signs in with just email + password.
--
-- NOTE for existing databases that already ran 0004: re-run the (updated)
-- 0004_policies.sql after this file — it is idempotent. The profiles MFA
-- policies are already recreated below as a convenience.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PLATFORM SETTINGS (single row)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_settings (
  id integer primary key default 1 check (id = 1),
  allow_public_signup boolean not null default true,
  signup_domain_restriction boolean not null default true,
  signup_allowed_domains text[] not null default '{kluniversity.in}',
  interview_day_1 date,
  interview_day_2 date,
  facebook_url text,
  instagram_url text,
  linkedin_url text,
  twitter_url text,
  youtube_url text,
  contact_email text,
  contact_phone text,
  office_address text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists touch_platform_settings on public.platform_settings;
create trigger touch_platform_settings before update on public.platform_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- PROFILES: recruitment statuses + alternating interview batch
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check
    check (status in ('pending', 'recruit', 'active', 'disabled'));

alter table public.profiles add column if not exists interview_batch smallint
  check (interview_batch in (1, 2));

-- ---------------------------------------------------------------------------
-- EVENT TEAM MEMBERS: hours worked (shown in "My Events" for volunteers)
-- ---------------------------------------------------------------------------
alter table public.event_team_members add column if not exists hours_worked numeric
  not null default 0 check (hours_worked >= 0);

-- ---------------------------------------------------------------------------
-- NEW USER: pending recruit by default, alternating interview batch
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'member');
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
  v_status text := 'pending';
  v_batch smallint;
  v_pending bigint;
begin
  if v_role = 'member' then
    v_role := 'member';
  elsif v_role not in ('super_admin','event_admin','member_admin','content_admin','gallery_admin','reports_admin','attendance_coordinator','mail_admin') then
    v_role := 'member';
  end if;

  if v_role <> 'member' then
    v_status := 'active';
  else
    select count(*) into v_pending from public.profiles where status = 'pending';
    v_batch := case when v_pending % 2 = 0 then 1 else 2 end;
  end if;

  insert into public.profiles (
    id, email, full_name, role, ciie_id, mfa_setup_required,
    status, interview_batch, phone, department, year_of_study
  )
  values (
    new.id, new.email, v_name, v_role, public.next_ciie_id(),
    case when v_role <> 'member' then true else false end,
    v_status, v_batch,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'department',
    new.raw_user_meta_data ->> 'year_of_study'
  )
  on conflict (id) do nothing;

  insert into public.member_privacy_settings (member_id) values (new.id) on conflict do nothing;
  insert into public.member_qr_codes (member_id, code)
  values (new.id, encode(public.gen_random_bytes(9), 'hex'))
  on conflict (member_id) do nothing;

  if v_role <> 'member' then
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
    values (new.id, 'Admin Account Created', 'admin', new.id::text, jsonb_build_object('role', v_role));
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- ADMIN MFA: only super_admin requires TOTP (aal2). Every other role signs
-- in with just email + password. This relaxes every permissive policy that
-- calls admin_aal2() (insert/update/delete) automatically.
-- ---------------------------------------------------------------------------
create or replace function public.admin_aal2()
returns boolean
language sql stable set search_path = ''
as $$
  select public.is_admin()
     and (not public.is_super_admin() or (auth.jwt() ->> 'aal') = 'aal2');
$$;

-- ---------------------------------------------------------------------------
-- RLS: platform_settings readable by everyone (signup page + navbar need it
-- while logged out), writable only by super admin (who is MFA-gated).
-- ---------------------------------------------------------------------------
alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_public_read on public.platform_settings;
create policy platform_settings_public_read on public.platform_settings
  for select to anon, authenticated
  using (true);

drop policy if exists platform_settings_admin_write on public.platform_settings;
create policy platform_settings_admin_write on public.platform_settings
  for update to authenticated
  using (public.is_super_admin() and public.admin_aal2())
  with check (public.is_super_admin() and public.admin_aal2());

-- ---------------------------------------------------------------------------
-- Profiles MFA policies: recreate so only super_admin is MFA-gated.
-- (On a fresh install 0004 already has the updated expressions.)
-- ---------------------------------------------------------------------------
drop policy if exists profiles_admin_read_mfa on public.profiles;
create policy profiles_admin_read_mfa on public.profiles
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists profiles_admin_update_mfa on public.profiles;
create policy profiles_admin_update_mfa on public.profiles
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin())
  with check ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());
