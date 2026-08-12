-- ============================================================================
-- KL CIIE Platform V2 — 0008: role-based registration keys + event attendance QR
-- 1) New roles: member_ciie (member) and main_admin (top admin, MFA-gated).
-- 2) registration_roles: admin-configurable registration pages. Each page is
--    protected by a STATIC key (set by admin) plus a ROTATING alphanumeric MFA
--    code that changes every minute (HMAC-based TOTP-style, base34 alphabet).
--    Registration only completes when BOTH the static key and the current
--    rotating code are correct. The DB trigger verifies a signed token issued
--    by validate_role_registration() so the keys cannot be bypassed by calling
--    signUp() directly.
-- 3) signup_fields on platform_settings: admin-editable mandatory fields for
--    the general Join CIIE (/register) form.
-- 4) event_member_qr_codes: per-event attendance QR for members. The QR only
--    appears once the event has started, and rotates after attendance is marked
--    present. The admin scanner detects "Event Mismatch" when the scanned QR
--    belongs to another event.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) ROLES
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in (
    'user', 'member', 'member_ciie', 'super_admin', 'main_admin',
    'event_admin', 'member_admin', 'content_admin', 'gallery_admin',
    'reports_admin', 'attendance_coordinator', 'mail_admin'
  ));

-- Custom registration data stored alongside profile columns.
alter table public.profiles add column if not exists custom_fields jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2) REGISTRATION ROLES
-- ---------------------------------------------------------------------------
create table if not exists public.registration_roles (
  id uuid primary key default gen_random_uuid(),
  role text not null unique,
  slug text not null unique,
  label text not null,
  secret text not null,
  signing_secret text not null,
  enabled boolean not null default true,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.registration_roles add column if not exists requires_keys boolean not null default true;

-- ---------------------------------------------------------------------------
-- pgcrypto lives in the "extensions" schema on Supabase (not "public"). Functions
-- below pin search_path to '' so we can't rely on implicit resolution. Create
-- public wrappers for the pgcrypto functions we need — only if they are missing
-- (in case pgcrypto was installed into "public" in this project).
-- ---------------------------------------------------------------------------
do $body$
begin
  if to_regprocedure('public.hmac(bytea,bytea,text)') is null then
    create function public.hmac(data bytea, key bytea, pg_type text)
    returns bytea language sql immutable strict as $fn$
      select extensions.hmac(data, key, pg_type);
    $fn$;
  end if;
  if to_regprocedure('public.gen_random_bytes(integer)') is null then
    create function public.gen_random_bytes(len integer)
    returns bytea language sql volatile strict as $fn$
      select extensions.gen_random_bytes(len);
    $fn$;
  end if;
end;
$body$;

-- All roles get a hidden registration page (/register/<slug>, e.g. /register/member-ciie,
-- /register/user, /register/super_admin-ciie). The pages are NOT listed on the website —
-- they are only reachable via a direct link. Every page requires the static registration key
-- plus the current rotating MFA code, EXCEPT /register/user (requires_keys = false).
insert into public.registration_roles (role, slug, label, secret, signing_secret, enabled, requires_keys)
values
  ('user', 'user', 'CIIE User', '', encode(public.gen_random_bytes(24), 'hex'), true, false),
  ('member_ciie', 'member-ciie', 'CIIE Member', 'CIIE-2026-MEMBER', encode(public.gen_random_bytes(24), 'hex'), true, true),
  ('super_admin', 'super_admin-ciie', 'Super Admin', 'CIIE-2026-SUPER-ADMIN', encode(public.gen_random_bytes(24), 'hex'), true, true),
  ('main_admin', 'main_admin-ciie', 'Main Admin', 'CIIE-2026-MAIN-ADMIN', encode(public.gen_random_bytes(24), 'hex'), true, true),
  ('event_admin', 'event_admin-ciie', 'Event Admin', 'CIIE-2026-EVENT-ADMIN', encode(public.gen_random_bytes(24), 'hex'), true, true),
  ('member_admin', 'member_admin-ciie', 'Member Admin', 'CIIE-2026-MEMBER-ADMIN', encode(public.gen_random_bytes(24), 'hex'), true, true),
  ('content_admin', 'content_admin-ciie', 'Content Admin', 'CIIE-2026-CONTENT-ADMIN', encode(public.gen_random_bytes(24), 'hex'), true, true),
  ('gallery_admin', 'gallery_admin-ciie', 'Gallery Admin', 'CIIE-2026-GALLERY-ADMIN', encode(public.gen_random_bytes(24), 'hex'), true, true),
  ('reports_admin', 'reports_admin-ciie', 'Reports Admin', 'CIIE-2026-REPORTS-ADMIN', encode(public.gen_random_bytes(24), 'hex'), true, true),
  ('attendance_coordinator', 'attendance_coordinator-ciie', 'Attendance Coordinator', 'CIIE-2026-ATTENDANCE-ADMIN', encode(public.gen_random_bytes(24), 'hex'), true, true),
  ('mail_admin', 'mail_admin-ciie', 'Mail Admin', 'CIIE-2026-MAIL-ADMIN', encode(public.gen_random_bytes(24), 'hex'), true, true)
on conflict (slug) do update
  set role = excluded.role, label = excluded.label, requires_keys = excluded.requires_keys;

drop trigger if exists touch_registration_roles on public.registration_roles;
create trigger touch_registration_roles before update on public.registration_roles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3) SIGNUP FIELDS (Join CIIE form — admin editable, all mandatory)
-- ---------------------------------------------------------------------------
alter table public.platform_settings add column if not exists signup_fields jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 4) EVENT MEMBER ATTENDANCE QR
-- ---------------------------------------------------------------------------
create table if not exists public.event_member_qr_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, member_id)
);
create index if not exists idx_event_qr_member on public.event_member_qr_codes (member_id);
create index if not exists idx_event_qr_code on public.event_member_qr_codes (code);

-- ---------------------------------------------------------------------------
-- ROTATING ALPHANUMERIC CODE (TOTP-style, 60s step, base34 alphabet)
-- ---------------------------------------------------------------------------
create or replace function public.registration_otp_at(p_secret text, p_back integer default 0, p_step integer default 60)
returns text
language plpgsql stable set search_path = ''
as $$
declare
  v_counter bigint;
  v_msg bytea;
  v_hmac bytea;
  v_offset integer;
  v_bin bigint;
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_base bigint := 34;
  v_out text := '';
  v_i integer;
begin
  if p_secret is null or p_secret = '' then
    return null;
  end if;
  v_counter := floor(extract(epoch from now()) / p_step)::bigint - p_back;
  v_msg := set_byte(set_byte(set_byte(set_byte(set_byte(set_byte(set_byte(set_byte(
    '\x0000000000000000'::bytea,
    0, ((v_counter >> 56) & 255)::int),
    1, ((v_counter >> 48) & 255)::int),
    2, ((v_counter >> 40) & 255)::int),
    3, ((v_counter >> 32) & 255)::int),
    4, ((v_counter >> 24) & 255)::int),
    5, ((v_counter >> 16) & 255)::int),
    6, ((v_counter >> 8) & 255)::int),
    7, (v_counter & 255)::int);
  v_hmac := public.hmac(v_msg, convert_to(p_secret, 'UTF8'), 'sha1');
  v_offset := get_byte(v_hmac, length(v_hmac) - 1) & 15;
  v_bin := ((get_byte(v_hmac, v_offset) & 127)::bigint << 24)
         | ((get_byte(v_hmac, v_offset + 1) & 255)::bigint << 16)
         | ((get_byte(v_hmac, v_offset + 2) & 255)::bigint << 8)
         | (get_byte(v_hmac, v_offset + 3) & 255)::bigint;
  v_bin := v_bin % (34 ^ 6);
  for v_i in 1..6 loop
    v_out := substr(v_alphabet, (v_bin % v_base)::int + 1, 1) || v_out;
    v_bin := v_bin / v_base;
  end loop;
  return v_out;
end;
$$;

create or replace function public.registration_otp(p_secret text)
returns text
language sql stable set search_path = ''
as $$
  select public.registration_otp_at(p_secret, 0, 60);
$$;

-- Signed token proving validate_role_registration() was called this window.
create or replace function public.registration_token(p_slug text, p_email text, p_window bigint, p_signing_secret text)
returns text
language sql stable set search_path = ''
as $$
  select encode(public.hmac(convert_to(p_slug || '|' || lower(p_email) || '|' || p_window, 'UTF8'),
                           convert_to(p_signing_secret, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function public.verify_registration_token(p_slug text, p_email text, p_token text, p_signing_secret text)
returns boolean
language sql stable set search_path = ''
as $$
  select p_token = public.registration_token(p_slug, p_email, floor(extract(epoch from now()) / 60)::bigint, p_signing_secret)
      or p_token = public.registration_token(p_slug, p_email, floor(extract(epoch from now()) / 60)::bigint - 1, p_signing_secret);
$$;

-- ---------------------------------------------------------------------------
-- PUBLIC READ: enabled registration roles (slug + label only, no secrets)
-- ---------------------------------------------------------------------------
create or replace function public.get_enabled_registration_roles()
returns table (role text, slug text, label text, fields jsonb)
language sql stable security definer set search_path = ''
as $$
  select r.role, r.slug, r.label, r.fields
  from public.registration_roles r
  where r.enabled
  order by r.created_at asc;
$$;

create or replace function public.get_registration_role(p_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'role', r.role, 'slug', r.slug, 'label', r.label,
    'enabled', r.enabled, 'fields', r.fields, 'requires_keys', r.requires_keys
  )
  from public.registration_roles r
  where r.slug = p_slug;
$$;

-- ---------------------------------------------------------------------------
-- VALIDATE keys and issue a registration token
-- ---------------------------------------------------------------------------
create or replace function public.validate_role_registration(p_slug text, p_static_key text, p_code text, p_email text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.registration_roles%rowtype;
  v_window bigint;
  v_token text;
begin
  if p_email is null or position('@' in p_email) = 0 then
    return jsonb_build_object('valid', false, 'error', 'Please enter a valid email address.');
  end if;
  select * into v_role from public.registration_roles where slug = p_slug and enabled;
  if not found then
    return jsonb_build_object('valid', false, 'error', 'This registration page is not available.');
  end if;
  if v_role.requires_keys then
    if nullif(trim(p_static_key), '') is null or trim(p_static_key) <> v_role.secret then
      return jsonb_build_object('valid', false, 'error', 'The registration key is incorrect.');
    end if;
    if upper(trim(p_code)) <> public.registration_otp(v_role.secret)
       and upper(trim(p_code)) <> public.registration_otp_at(v_role.secret, 1, 60) then
      return jsonb_build_object('valid', false, 'error', 'The MFA code is incorrect or expired. Codes change every minute.');
    end if;
  end if;
  v_window := floor(extract(epoch from now()) / 60)::bigint;
  v_token := public.registration_token(p_slug, p_email, v_window, v_role.signing_secret);
  return jsonb_build_object(
    'valid', true, 'error', null,
    'token', v_token, 'role', v_role.role, 'label', v_role.label
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- ATTENDANCE: event QR helpers
-- ---------------------------------------------------------------------------
create or replace function public.get_my_event_attendance_qr(p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_started boolean;
  v_code text;
  v_registered boolean;
  v_present boolean := false;
  v_marked_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('error', 'Event not found.');
  end if;
  select exists(
    select 1 from public.event_registrations r
    where r.event_id = p_event_id and r.member_id = v_uid and r.status <> 'cancelled'
  ) into v_registered;
  if not v_registered then
    return jsonb_build_object('error', 'You are not registered for this event.');
  end if;

  select status, marked_at into v_present, v_marked_at
  from public.attendance
  where event_id = p_event_id and member_id = v_uid and status = 'present'
  order by marked_at desc limit 1;

  v_started := now() >= (v_event.start_date::timestamp + coalesce(nullif(v_event.start_time, ''), '00:00')::time);

  if not v_started then
    return jsonb_build_object(
      'started', false, 'present', v_present,
      'event_title', v_event.title, 'start_date', v_event.start_date, 'start_time', v_event.start_time
    );
  end if;

  insert into public.event_member_qr_codes (event_id, member_id, code)
  values (p_event_id, v_uid, encode(public.gen_random_bytes(9), 'hex'))
  on conflict (event_id, member_id) do nothing;

  select eq.code into v_code
  from public.event_member_qr_codes eq
  where eq.event_id = p_event_id and eq.member_id = v_uid;

  return jsonb_build_object(
    'started', true, 'present', v_present, 'code', v_code,
    'marked_at', v_marked_at,
    'event_title', v_event.title, 'start_date', v_event.start_date, 'start_time', v_event.start_time
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- MARK ATTENDANCE — extended for event-member QR codes with event matching
-- ---------------------------------------------------------------------------
drop function if exists public.mark_attendance(uuid, text, text, text);
create or replace function public.mark_attendance(
  p_event_id uuid,
  p_registration_code text default null,
  p_member_code text default null,
  p_method text default 'qr',
  p_qr_event_id uuid default null
)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  v_att public.attendance%rowtype;
  v_reg_id uuid;
  v_member_id uuid;
  v_qr_event uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if p_registration_code is not null then
    select id, member_id into v_reg_id, v_member_id
    from public.event_registrations
    where registration_code = p_registration_code and event_id = p_event_id and status <> 'cancelled';
    if not found then
      raise exception 'Invalid registration code for this event';
    end if;
  elsif p_member_code is not null then
    select eq.event_id, eq.member_id into v_qr_event, v_member_id
    from public.event_member_qr_codes eq
    where eq.code = p_member_code;
    if found then
      if (p_qr_event_id is not null and p_qr_event_id <> v_qr_event)
         or (p_qr_event_id is null and v_qr_event <> p_event_id) then
        raise exception using errcode = 'EVTMIS', message = 'Event Mismatch';
      end if;
      if v_qr_event <> p_event_id then
        raise exception using errcode = 'EVTMIS', message = 'Event Mismatch';
      end if;
      select id into v_reg_id
      from public.event_registrations
      where event_id = p_event_id and member_id = v_member_id and status <> 'cancelled'
      order by created_at desc limit 1;
      update public.event_member_qr_codes
      set code = encode(public.gen_random_bytes(9), 'hex'), used_at = now()
      where event_id = p_event_id and member_id = v_member_id;
    else
      select mq.member_id into v_member_id
      from public.member_qr_codes mq
      where mq.code = p_member_code;
      if not found then
        raise exception 'Invalid member code';
      end if;
      select id into v_reg_id
      from public.event_registrations
      where event_id = p_event_id and member_id = v_member_id and status <> 'cancelled'
      order by created_at desc limit 1;
    end if;
  else
    raise exception 'Missing code';
  end if;

  if v_member_id is null then
    raise exception 'No CIIE member linked to this registration';
  end if;

  insert into public.attendance (event_id, registration_id, member_id, status, method, marked_by)
  values (p_event_id, v_reg_id, v_member_id, 'present', p_method, auth.uid())
  on conflict (registration_id)
  do update set status = 'present', method = excluded.method, marked_by = excluded.marked_by, marked_at = now()
  returning * into v_att;

  return v_att;
end;
$$;

-- ---------------------------------------------------------------------------
-- HANDLE NEW USER — role-based registration with token verification
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_meta jsonb := new.raw_user_meta_data;
  v_role text := coalesce(v_meta ->> 'role', 'member');
  v_name text := coalesce(v_meta ->> 'full_name', split_part(new.email, '@', 1));
  v_slug text := v_meta ->> 'role_slug';
  v_token text := v_meta ->> 'registration_token';
  v_status text := 'pending';
  v_batch smallint;
  v_pending bigint;
  v_mfa boolean := false;
  v_reg_row public.registration_roles%rowtype;
  v_custom jsonb;
begin
  if v_slug is not null and v_token is not null then
    select * into v_reg_row from public.registration_roles where slug = v_slug and role = v_role and enabled;
    if found and public.verify_registration_token(v_slug, new.email, v_token, v_reg_row.signing_secret) then
      v_status := 'active';
      if v_role in ('super_admin','main_admin','event_admin','member_admin','content_admin',
                   'gallery_admin','reports_admin','attendance_coordinator','mail_admin') then
        v_mfa := true;
      end if;
    else
      v_role := 'member';
      v_slug := null;
    end if;
  end if;

  if v_slug is null then
    v_role := 'member';
    v_status := 'pending';
    select count(*) into v_pending from public.profiles where status = 'pending';
    v_batch := case when v_pending % 2 = 0 then 1 else 2 end;
  end if;

  select jsonb_object_agg(k, val)
  into v_custom
  from jsonb_each_text(v_meta) as t(k, val)
  where k not in ('role','role_slug','registration_token','full_name','phone','department','year_of_study');

  insert into public.profiles (
    id, email, full_name, role, ciie_id, mfa_setup_required,
    status, interview_batch, phone, department, year_of_study, custom_fields
  )
  values (
    new.id, new.email, v_name, v_role, public.next_ciie_id(),
    v_mfa,
    v_status, v_batch,
    v_meta ->> 'phone',
    v_meta ->> 'department',
    v_meta ->> 'year_of_study',
    coalesce(v_custom, '{}'::jsonb)
  )
  on conflict (id) do nothing;

  insert into public.member_privacy_settings (member_id) values (new.id) on conflict do nothing;
  insert into public.member_qr_codes (member_id, code)
  values (new.id, encode(public.gen_random_bytes(9), 'hex'))
  on conflict (member_id) do nothing;

  if v_role not in ('member', 'user') then
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
    values (new.id, 'Admin Account Created', 'admin', new.id::text, jsonb_build_object('role', v_role));
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- ADMIN AUDIT HELPERS — redefined here so the new "user" role is not treated
-- as an admin in login/audit logic (was: role <> 'member').
-- ---------------------------------------------------------------------------
create or replace function public.log_failed_admin_login(p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from public.profiles where lower(email) = lower(p_email) and role not in ('member', 'user');
  if v_user_id is null then
    return;
  end if;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id)
  values (v_user_id, 'Failed Admin Login', 'admin', v_user_id::text);
end;
$$;

create or replace function public.log_admin_login()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role not in ('member', 'user') then
    update public.profiles set last_login_at = now() where id = new.id;
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id)
    values (new.id, 'Admin Login', 'admin', new.id::text);
  end if;
  return new;
end;
$$;

create or replace function public.record_login(p_user_id uuid, p_success boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_success then
    update public.profiles set last_login_at = now() where id = p_user_id;
    if exists (select 1 from public.profiles where id = p_user_id and role not in ('member', 'user')) then
      insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id)
      values (p_user_id, 'Admin Login', 'admin', p_user_id::text);
    end if;
  else
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id)
    values (p_user_id, 'Failed Admin Login', 'admin', p_user_id::text);
  end if;
end;
$$;

create or replace function public.reset_admin_mfa(p_admin_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;
  update public.profiles
  set mfa_enabled = false, mfa_setup_required = true
  where id = p_admin_id and role not in ('member', 'user');
  delete from public.admin_recovery_codes where admin_id = p_admin_id;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'MFA Reset', 'admin', p_admin_id::text,
          jsonb_build_object('forced', true));
end;
$$;

-- ---------------------------------------------------------------------------
-- MAIN_ADMIN is a top-level admin (MFA-gated like super_admin)
-- ---------------------------------------------------------------------------
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

create or replace function public.is_super_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.status = 'active' and p.role in ('super_admin', 'main_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.registration_roles enable row level security;
alter table public.event_member_qr_codes enable row level security;

-- registration_roles: SUPER ADMIN only read/write (keys + codes are secret; the
-- pages themselves go through public RPCs).
drop policy if exists registration_roles_admin_read on public.registration_roles;
create policy registration_roles_admin_read on public.registration_roles
  for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and public.is_super_admin());

drop policy if exists registration_roles_admin_write on public.registration_roles;
create policy registration_roles_admin_write on public.registration_roles
  for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and public.is_super_admin())
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and public.is_super_admin());

-- event_member_qr_codes: self + admin read; admin write
drop policy if exists event_qr_self_read on public.event_member_qr_codes;
create policy event_qr_self_read on public.event_member_qr_codes
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists event_qr_admin_read on public.event_member_qr_codes;
create policy event_qr_admin_read on public.event_member_qr_codes
  for select to authenticated
  using (public.is_admin());

drop policy if exists event_qr_admin_write on public.event_member_qr_codes;
create policy event_qr_admin_write on public.event_member_qr_codes
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- GRANTS
-- ---------------------------------------------------------------------------
grant execute on function public.registration_otp(text) to authenticated;
grant execute on function public.registration_otp_at(text, integer, integer) to authenticated;
grant execute on function public.get_enabled_registration_roles() to anon, authenticated;
grant execute on function public.get_registration_role(text) to anon, authenticated;
grant execute on function public.validate_role_registration(text, text, text, text) to anon, authenticated;
grant execute on function public.get_my_event_attendance_qr(uuid) to authenticated;
grant execute on function public.mark_attendance(uuid, text, text, text, uuid) to authenticated;
