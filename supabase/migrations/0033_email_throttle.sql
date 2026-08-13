-- ============================================================================
-- KL CIIE Platform V2 — 0033: email resend throttling + 10-hour lockout
--
-- Verification emails (Join CIIE OTP + role-registration OTP) now enforce a
-- growing resend cooldown per email address:
--   * The first code is emailed immediately.
--   * A resend must wait 2 minutes after the previous send, then +30 seconds
--     per attempt (2:00, 2:30, 3:00, ...).
--   * After 15 codes have been emailed to one address, that address is locked
--     for 10 hours: no more codes can be sent AND the same email cannot
--     register again until the lock expires.
--
-- Counters live in public.email_verification_throttle, touched ONLY by the
-- security-definer RPCs below and the service-role Edge Function
-- (send-recruit-email). Clients read email_send_status() to render countdowns.
-- ============================================================================

create table if not exists public.email_verification_throttle (
  email text primary key,
  resend_count integer not null default 0,
  last_sent_at timestamptz,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.email_verification_throttle enable row level security;

-- No RLS policies on purpose: the table is only reachable through the
-- security-definer functions / service role below.

-- ---------------------------------------------------------------------------
-- 1) email_send_status: current cooldown / lock state for an address.
--    Returns { locked, locked_until, wait_seconds, attempts }.
--    wait_seconds = 0 when a new code may be emailed right now.
-- ---------------------------------------------------------------------------
create or replace function public.email_send_status(p_email text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'locked', (t.locked_until is not null and t.locked_until > now()),
    'locked_until', t.locked_until,
    'wait_seconds', (
      case
        when t.locked_until is not null and t.locked_until > now()
          then greatest(1, ceil(extract(epoch from (t.locked_until - now())))::int)
        when t.last_sent_at is not null
          then greatest(0, (120 + (t.resend_count - 1) * 30) - floor(extract(epoch from (now() - t.last_sent_at)))::int)
        else 0
      end
    ),
    'attempts', coalesce(t.resend_count, 0)
  )
  from public.email_verification_throttle t
  where t.email = lower(btrim(p_email))
$$;

grant execute on function public.email_send_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) email_send_recorded: record a successfully delivered code. Called ONLY by
--    the send-recruit-email Edge Function (service role). Locks the address
--    for 10 hours once 15 codes have been emailed.
-- ---------------------------------------------------------------------------
create or replace function public.email_send_recorded(p_email text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_count integer;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return jsonb_build_object('error', 'Invalid email address.');
  end if;

  insert into public.email_verification_throttle (email, resend_count, last_sent_at)
  values (v_email, 1, now())
  on conflict (email) do update
    set resend_count = public.email_verification_throttle.resend_count + 1,
        last_sent_at = now(),
        updated_at = now();

  select resend_count into v_count
  from public.email_verification_throttle
  where email = v_email;

  if v_count >= 15 then
    update public.email_verification_throttle
    set locked_until = now() + interval '10 hours',
        updated_at = now()
    where email = v_email;
  end if;

  return public.email_send_status(v_email);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) apply_to_ciie: block a locked email from applying, and stop nuking a
--    still-valid code when someone re-applies mid-cooldown.
-- ---------------------------------------------------------------------------
create or replace function public.apply_to_ciie(
  p_full_name text,
  p_email text,
  p_student_id text default null,
  p_phone text default null,
  p_department text default null,
  p_year_of_study text default null,
  p_fields jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_settings public.platform_settings%rowtype;
  v_domain text;
  v_allowed text;
  v_id uuid;
begin
  -- Public signup toggle.
  select * into v_settings from public.platform_settings where id = 1;
  if not v_settings.allow_public_signup then
    raise exception 'Recruitment is currently closed.';
  end if;

  -- Basic validation.
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'Please enter your full name.';
  end if;
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'Please enter a valid email address.';
  end if;
  if p_student_id is null or btrim(p_student_id) = '' then
    raise exception 'Please enter your student ID.';
  end if;

  -- 10-hour lockout after too many verification emails to this address.
  if (public.email_send_status(lower(btrim(p_email))) ->> 'locked')::boolean then
    raise exception 'Too many verification attempts for this email. Please try again after 10 hours.';
  end if;

  -- KL University email restriction (mirrors the signup page + role registration).
  if v_settings.signup_domain_restriction then
    v_domain := lower(split_part(lower(p_email), '@', 2));
    select string_agg('@' || btrim(d), ', ' order by d)
      into v_allowed
      from unnest(v_settings.signup_allowed_domains) as d;
    if v_allowed is null or v_domain is null or v_domain = ''
       or not exists (
         select 1
         from unnest(v_settings.signup_allowed_domains) as d
         where v_domain = lower(btrim(d)) or v_domain like '%.' || lower(btrim(d))
       ) then
      raise exception 'Registration is limited to % email addresses.',
        coalesce(v_allowed, 'KL University');
    end if;
  end if;

  -- One pending application per email; re-applying reuses the row (the Edge
  -- Function will mint a fresh code on top of it). A still-valid code is kept
  -- so a mid-cooldown re-apply does not strand the applicant without a code.
  select id into v_id
  from public.join_applications
  where lower(email) = lower(btrim(p_email)) and status in ('pending', 'expired')
  order by created_at desc limit 1;

  if v_id is null then
    insert into public.join_applications (
      email, full_name, student_id, phone, department, year_of_study, fields,
      status, code_hash, code_expires_at, code_attempts
    )
    values (
      lower(btrim(p_email)), btrim(p_full_name), nullif(btrim(coalesce(p_student_id, '')), ''),
      nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_department, '')), ''),
      nullif(btrim(coalesce(p_year_of_study, '')), ''),
      coalesce(p_fields, '{}'::jsonb),
      'pending', null, null, 0
    )
    returning id into v_id;
  else
    update public.join_applications
    set full_name = btrim(p_full_name),
        student_id = nullif(btrim(coalesce(p_student_id, '')), ''),
        phone = nullif(btrim(coalesce(p_phone, '')), ''),
        department = nullif(btrim(coalesce(p_department, '')), ''),
        year_of_study = nullif(btrim(coalesce(p_year_of_study, '')), ''),
        fields = coalesce(p_fields, '{}'::jsonb),
        status = 'pending',
        verified_at = null,
        -- Clear the old code only when it is expired / exhausted; otherwise keep
        -- it so the applicant can still verify while the resend cooldown runs.
        code_hash = case
          when code_hash is null or code_expires_at is null
               or code_expires_at < now() or code_attempts >= 5
            then null
          else code_hash
        end,
        code_expires_at = case
          when code_hash is null or code_expires_at is null
               or code_expires_at < now() or code_attempts >= 5
            then null
          else code_expires_at
        end,
        code_attempts = case
          when code_hash is null or code_expires_at is null
               or code_expires_at < now() or code_attempts >= 5
            then 0
          else code_attempts
        end
    where id = v_id;
  end if;

  return jsonb_build_object(
    'application_id', v_id,
    'to_email', lower(btrim(p_email)),
    'full_name', btrim(p_full_name)
  );
end;
$$;

grant execute on function public.apply_to_ciie(text, text, text, text, text, text, jsonb)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) validate_role_registration: block a locked email from role registration.
-- ---------------------------------------------------------------------------
create or replace function public.validate_role_registration(p_slug text, p_static_key text, p_code text, p_email text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.registration_roles%rowtype;
  v_window bigint;
  v_token text;
  v_settings public.platform_settings%rowtype;
  v_domain text;
  v_allowed text;
begin
  if p_email is null or position('@' in p_email) = 0 then
    return jsonb_build_object('valid', false, 'error', 'Please enter a valid email address.');
  end if;

  -- 10-hour lockout after too many verification emails to this address.
  if (public.email_send_status(lower(btrim(p_email))) ->> 'locked')::boolean then
    return jsonb_build_object('valid', false, 'error',
      'Too many verification attempts for this email. Please try again after 10 hours.');
  end if;

  -- KL University email restriction (mirrors the signup page).
  select * into v_settings from public.platform_settings where id = 1;
  if v_settings.signup_domain_restriction then
    v_domain := lower(split_part(lower(p_email), '@', 2));
    select string_agg('@' || btrim(d), ', ' order by d)
      into v_allowed
      from unnest(v_settings.signup_allowed_domains) as d;
    if v_allowed is null or v_domain is null or v_domain = ''
       or not exists (
         select 1
         from unnest(v_settings.signup_allowed_domains) as d
         where v_domain = lower(btrim(d)) or v_domain like '%.' || lower(btrim(d))
       ) then
      return jsonb_build_object('valid', false, 'error',
        'Registration is limited to ' || coalesce(v_allowed, 'KL University') || ' email addresses.');
    end if;
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
