-- ============================================================================
-- KL CIIE Platform V2 — 0030: admin-managed SMTP accounts + email OTP
--
-- SMTP credentials move from Edge Function env secrets into the database so
-- the Super Admin can manage up to 10 Gmail accounts from the Admin panel
-- (/admin/smtp). The send-recruit-email Edge Function reads this table and
-- fails over silently through every active account (1st -> 2nd -> 3rd ...),
-- only surfacing an error to the user when EVERY configured account fails.
-- If 1 or 2 accounts are entered, only those are used.
--
-- Registration OTP:
--   * email_otp_codes holds the SHA-256 hashes of freshly minted 6-digit codes
--     (purpose = 'role:<slug>' for role registration, or the Join CIIE flow
--     keeps using join_applications as before).
--   * registration_email_verifications is the proof-of-verification ledger that
--     handle_new_user() checks, so a role registration can only complete if the
--     email was actually verified with an OTP (Supabase "Confirm email" is
--     disabled — this replaces it).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) SMTP ACCOUNTS (up to 10, ordered for failover)
-- ---------------------------------------------------------------------------
create table if not exists public.smtp_settings (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password text not null,
  from_name text not null default 'KL CIIE',
  host text not null default 'smtp.gmail.com',
  port integer not null default 465 check (port > 0),
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists smtp_settings_position_idx on public.smtp_settings (position);

drop trigger if exists touch_smtp_settings on public.smtp_settings;
create trigger touch_smtp_settings before update on public.smtp_settings
  for each row execute function public.touch_updated_at();

-- Only the Super Admin (MFA-gated, aal2) can read or write these credentials.
alter table public.smtp_settings enable row level security;

drop policy if exists smtp_settings_admin_all on public.smtp_settings;
create policy smtp_settings_admin_all on public.smtp_settings
  for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' and public.is_super_admin())
  with check ((select auth.jwt() ->> 'aal') = 'aal2' and public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 2) EMAIL OTP CODES (role registration). Anon / authenticated can never read
--    the codes directly — the Edge Function (service role) inserts them and the
--    verify_email_otp() RPC (security definer) validates them.
-- ---------------------------------------------------------------------------
create table if not exists public.email_otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_otp_codes_lookup_idx on public.email_otp_codes (lower(email), purpose, created_at desc);

alter table public.email_otp_codes enable row level security;

-- ---------------------------------------------------------------------------
-- 3) PROOF-OF-VERIFICATION LEDGER (checked by handle_new_user)
-- ---------------------------------------------------------------------------
create table if not exists public.registration_email_verifications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null,
  time_window bigint not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (email, purpose, time_window)
);

create index if not exists registration_email_verifications_lookup_idx
  on public.registration_email_verifications (lower(email), purpose);

alter table public.registration_email_verifications enable row level security;

-- ---------------------------------------------------------------------------
-- 4) RPC: list SMTP accounts (Admin panel)
-- ---------------------------------------------------------------------------
create or replace function public.get_smtp_settings()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not ((select auth.jwt() ->> 'aal') = 'aal2' and public.is_super_admin()) then
    raise exception 'Not authorized';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'email', s.email, 'password', s.password,
      'from_name', s.from_name, 'host', s.host, 'port', s.port,
      'is_active', s.is_active, 'position', s.position
    ) order by s.position asc, s.created_at asc)
    from public.smtp_settings s
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) RPC: save the SMTP account list (upsert, max 10)
-- ---------------------------------------------------------------------------
create or replace function public.save_smtp_settings(p_settings jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_email text;
  v_password text;
  v_from_name text;
  v_host text;
  v_port integer;
  v_active boolean;
  v_position integer;
  v_saved jsonb := '[]'::jsonb;
begin
  if not ((select auth.jwt() ->> 'aal') = 'aal2' and public.is_super_admin()) then
    raise exception 'Not authorized';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'array' then
    raise exception 'Expected an array of SMTP settings';
  end if;
  if jsonb_array_length(p_settings) > 10 then
    raise exception 'A maximum of 10 SMTP accounts is allowed';
  end if;

  for v_item in select * from jsonb_array_elements(p_settings)
  loop
    v_email := nullif(btrim(coalesce(v_item ->> 'email', '')), '');
    v_password := nullif(v_item ->> 'password', '');
    v_from_name := coalesce(nullif(btrim(coalesce(v_item ->> 'from_name', '')), ''), 'KL CIIE');
    v_host := coalesce(nullif(btrim(coalesce(v_item ->> 'host', '')), ''), 'smtp.gmail.com');
    v_port := coalesce((v_item ->> 'port')::integer, 465);
    v_active := coalesce((v_item ->> 'is_active')::boolean, true);
    v_position := coalesce((v_item ->> 'position')::integer, 0);

    if v_email is null or position('@' in v_email) = 0 then
      raise exception 'Every SMTP account needs a valid email address.';
    end if;
    if v_password is null or length(v_password) < 4 then
      raise exception 'Every SMTP account needs a password (16-char Gmail app password).';
    end if;

    v_id := nullif(v_item ->> 'id', '')::uuid;
    if v_id is null then
      insert into public.smtp_settings (email, password, from_name, host, port, is_active, position)
      values (v_email, v_password, v_from_name, v_host, v_port, v_active, v_position)
      returning id into v_id;
    else
      update public.smtp_settings
      set email = v_email,
          password = v_password,
          from_name = v_from_name,
          host = v_host,
          port = v_port,
          is_active = v_active,
          position = v_position
      where id = v_id;
      if not found then
        raise exception 'SMTP account not found';
      end if;
    end if;

    v_saved := v_saved || jsonb_build_object(
      'id', v_id, 'email', v_email, 'from_name', v_from_name,
      'host', v_host, 'port', v_port, 'is_active', v_active, 'position', v_position
    );
  end loop;

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'SMTP Settings Updated', 'smtp', 'pool',
          jsonb_build_object('count', jsonb_array_length(p_settings)));

  return v_saved;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) RPC: delete one SMTP account
-- ---------------------------------------------------------------------------
create or replace function public.delete_smtp_setting(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text;
begin
  if not ((select auth.jwt() ->> 'aal') = 'aal2' and public.is_super_admin()) then
    raise exception 'Not authorized';
  end if;
  select email into v_email from public.smtp_settings where id = p_id;
  if not found then
    return;
  end if;
  delete from public.smtp_settings where id = p_id;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'SMTP Account Deleted', 'smtp', p_id::text, jsonb_build_object('email', v_email));
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) RPC: verify an email OTP (used by role registration). On success records
--    the proof in registration_email_verifications for handle_new_user().
-- ---------------------------------------------------------------------------
create or replace function public.verify_email_otp(p_email text, p_purpose text, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.email_otp_codes%rowtype;
  v_window bigint;
begin
  if p_email is null or position('@' in p_email) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid email address.');
  end if;
  if p_purpose is null or btrim(p_purpose) = '' then
    return jsonb_build_object('ok', false, 'error', 'Missing verification purpose.');
  end if;
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter the 6-digit code you received by email.');
  end if;

  select * into v_row
  from public.email_otp_codes
  where lower(email) = lower(btrim(p_email))
    and purpose = btrim(p_purpose)
    and consumed_at is null
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'No verification code was sent to this email. Please request a new code.');
  end if;
  if v_row.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'The code has expired. Please request a new code.');
  end if;
  if v_row.attempts >= 5 then
    update public.email_otp_codes set consumed_at = now() where id = v_row.id;
    return jsonb_build_object('ok', false, 'error', 'Too many wrong attempts. Please request a new code.');
  end if;

  if encode(public.digest(upper(btrim(p_code)), 'sha256'), 'hex') <> v_row.code_hash then
    update public.email_otp_codes set attempts = attempts + 1 where id = v_row.id;
    return jsonb_build_object('ok', false, 'error', 'That code is incorrect. Please check your email and try again.');
  end if;

  update public.email_otp_codes set consumed_at = now() where id = v_row.id;

  v_window := floor(extract(epoch from now()) / 60)::bigint;
  insert into public.registration_email_verifications (email, purpose, time_window, expires_at)
  values (lower(btrim(p_email)), btrim(p_purpose), v_window, now() + interval '5 minutes')
  on conflict (email, purpose, time_window)
  do update set expires_at = excluded.expires_at;

  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) handle_new_user: role registration now REQUIRES a verified email OTP.
--    This mirrors the latest definition from 0008 with the OTP gate added.
-- ---------------------------------------------------------------------------
do $body$
begin
  if to_regprocedure('public.digest(text,text)') is null
     and to_regprocedure('extensions.digest(text,text)') is not null then
    create function public.digest(data text, pg_type text)
    returns bytea language sql immutable strict as $fn$
      select extensions.digest(data, pg_type);
    $fn$;
  end if;
end;
$body$;

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
  v_otp_ok boolean := false;
  v_window bigint := floor(extract(epoch from now()) / 60)::bigint;
  v_custom jsonb;
begin
  if v_slug is not null and v_token is not null then
    select * into v_reg_row from public.registration_roles where slug = v_slug and role = v_role and enabled;
    if found and public.verify_registration_token(v_slug, new.email, v_token, v_reg_row.signing_secret) then
      select exists (
        select 1 from public.registration_email_verifications ev
        where ev.email = lower(new.email)
          and ev.purpose = 'role:' || v_slug
          and ev.time_window in (v_window, v_window - 1, v_window - 2)
          and ev.expires_at > now()
      ) into v_otp_ok;
      if v_otp_ok then
        v_status := 'active';
        if v_role in ('super_admin','main_admin','event_admin','member_admin','content_admin',
                      'gallery_admin','reports_admin','attendance_coordinator','mail_admin') then
          v_mfa := true;
        end if;
      else
        raise exception 'Email verification is required to complete registration. Please go back and enter the verification code sent to your email.';
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
-- 9) email log: record which SMTP account delivered each message
-- ---------------------------------------------------------------------------
alter table public.recruit_emails add column if not exists smtp_email text;

-- ---------------------------------------------------------------------------
-- 10) GRANTS
-- ---------------------------------------------------------------------------
grant execute on function public.get_smtp_settings() to authenticated;
grant execute on function public.save_smtp_settings(jsonb) to authenticated;
grant execute on function public.delete_smtp_setting(uuid) to authenticated;
grant execute on function public.verify_email_otp(text, text, text) to anon, authenticated;
