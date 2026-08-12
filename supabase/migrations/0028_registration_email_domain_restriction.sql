-- ---------------------------------------------------------------------------
-- FIX: role-based registration (/register/:slug, including /register/user)
-- did not restrict to KL University email addresses. The member signup page
-- enforces this client-side via platform_settings, but role registration only
-- validated the static key + rotating code. Enforce the same allowed-domain
-- rule here (server-side) so a non-KLU email can never be issued a token.
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
