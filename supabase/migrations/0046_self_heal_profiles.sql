-- ============================================================================
-- KL CIIE Platform V2 — 0046: self-heal missing profiles
--
-- Fixes "Profile not found" after login: an auth account can exist without a
-- public.profiles row when the account was created before the
-- on_auth_user_created trigger was applied, or when its profile row was lost.
-- Until now nothing ever recreated it, so useAuth.loadProfile() returned null
-- and /dashboard/profile rendered "Profile not found".
--
-- 1) public.ensure_my_profile() — idempotent SECURITY DEFINER RPC callable by
--    any authenticated user; recreates their own profile + privacy settings +
--    QR code from auth.users metadata (mirrors handle_new_user).
-- 2) One-time backfill of every existing auth user that has no profile row.
-- ============================================================================

create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meta jsonb;
  v_role text;
  v_email text;
  v_name text;
  v_status text := 'pending';
  v_batch smallint;
  v_pending bigint;
  v_mfa boolean := false;
  v_custom jsonb;
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    return null;
  end if;

  if not exists (select 1 from auth.users where id = v_uid) then
    return null;
  end if;

  -- Always make sure the companion rows exist.
  insert into public.member_privacy_settings (member_id) values (v_uid) on conflict do nothing;
  insert into public.member_qr_codes (member_id, code)
  values (v_uid, encode(public.gen_random_bytes(9), 'hex'))
  on conflict (member_id) do nothing;

  select * into v_profile from public.profiles where id = v_uid;
  if found then
    return v_profile;
  end if;

  select raw_user_meta_data, email into v_meta, v_email
  from auth.users where id = v_uid;
  v_meta := coalesce(v_meta, '{}'::jsonb);
  v_name := coalesce(v_meta ->> 'full_name', split_part(coalesce(v_email, ''), '@', 1));

  v_role := coalesce(v_meta ->> 'role', 'member');
  -- Only known roles survive; anything else falls back to plain member.
  if v_role not in (
    'user', 'member', 'member_ciie',
    'super_admin', 'main_admin', 'event_admin', 'member_admin',
    'content_admin', 'gallery_admin', 'reports_admin',
    'attendance_coordinator', 'mail_admin'
  ) then
    v_role := 'member';
  end if;

  if v_role not in ('member', 'user') then
    v_status := 'active';
    if v_role in ('super_admin', 'main_admin') then
      v_mfa := true;
    end if;
  else
    select count(*) into v_pending from public.profiles where status = 'pending';
    v_batch := case when v_pending % 2 = 0 then 1 else 2 end;
  end if;

  select jsonb_object_agg(k, val)
  into v_custom
  from jsonb_each_text(v_meta) as t(k, val)
  where k not in ('role', 'role_slug', 'registration_token', 'full_name', 'phone', 'department', 'year_of_study');

  insert into public.profiles (
    id, email, full_name, role, ciie_id, mfa_setup_required,
    status, interview_batch, phone, department, year_of_study, custom_fields
  )
  values (
    v_uid,
    v_email,
    nullif(v_name, ''), v_role, public.next_ciie_id(),
    v_mfa,
    v_status, v_batch,
    v_meta ->> 'phone',
    v_meta ->> 'department',
    v_meta ->> 'year_of_study',
    coalesce(v_custom, '{}'::jsonb)
  )
  on conflict (id) do nothing;

  select * into v_profile from public.profiles where id = v_uid;
  return v_profile;
end;
$$;

grant execute on function public.ensure_my_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- One-time backfill: recreate profile rows for every existing auth user that
-- is missing one (same rules as ensure_my_profile / handle_new_user).
-- next_ciie_id() is STABLE and would collide within a single multi-row
-- INSERT, so IDs are computed here with row_number() off the current max.
-- ---------------------------------------------------------------------------
with missing as (
  select u.*, row_number() over (order by u.created_at, u.id) as rn
  from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id)
),
base as (
  select coalesce(max(substring(ciie_id from 9)::int), 0)::int as max_seq
  from public.profiles
  where ciie_id like 'CIIE' || to_char(extract(year from now())::int, 'FM0000') || '%'
),
norm as (
  select
    m.*,
    case
      when coalesce(m.raw_user_meta_data ->> 'role', 'member') in (
        'super_admin', 'main_admin', 'event_admin', 'member_admin',
        'content_admin', 'gallery_admin', 'reports_admin',
        'attendance_coordinator', 'mail_admin'
      ) then coalesce(m.raw_user_meta_data ->> 'role', 'member')
      else 'member'
    end as v_role
  from missing m
)
insert into public.profiles (
  id, email, full_name, role, ciie_id, mfa_setup_required,
  status, interview_batch, phone, department, year_of_study, custom_fields
)
select
  n.id,
  n.email,
  nullif(coalesce(n.raw_user_meta_data ->> 'full_name', split_part(coalesce(n.email, ''), '@', 1)), ''),
  n.v_role,
  'CIIE' || to_char(extract(year from now())::int, 'FM0000')
    || lpad((b.max_seq + n.rn)::text, 5, '0'),
  n.v_role in ('super_admin', 'main_admin'),
  case when n.v_role <> 'member' then 'active' else 'pending' end,
  case when n.v_role <> 'member'
       then null
       else (case when n.rn % 2 = 1 then 1 else 2 end)::smallint end,
  n.raw_user_meta_data ->> 'phone',
  n.raw_user_meta_data ->> 'department',
  n.raw_user_meta_data ->> 'year_of_study',
  coalesce(
    (select jsonb_object_agg(k, val)
     from jsonb_each_text(coalesce(n.raw_user_meta_data, '{}'::jsonb)) as t(k, val)
     where k not in ('role', 'role_slug', 'registration_token', 'full_name', 'phone', 'department', 'year_of_study')),
    '{}'::jsonb
  )
from norm n cross join base b
on conflict (id) do nothing;

-- Privacy settings + QR codes for every backfilled profile.
insert into public.member_privacy_settings (member_id)
select p.id from public.profiles p
where not exists (select 1 from public.member_privacy_settings s where s.member_id = p.id)
on conflict do nothing;

insert into public.member_qr_codes (member_id, code)
select p.id, encode(public.gen_random_bytes(9), 'hex')
from public.profiles p
where not exists (select 1 from public.member_qr_codes q where q.member_id = p.id)
on conflict (member_id) do nothing;
