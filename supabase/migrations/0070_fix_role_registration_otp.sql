-- ---------------------------------------------------------------------------
-- 0070: Fix "Database error saving new user" on role registration
--
-- handle_new_user() unconditionally required an email OTP proof row in
-- registration_email_verifications for every keyed role registration. When
-- the platform setting `signup_email_otp` is DISABLED (as it is on the live
-- site), the front end registers the user directly without ever verifying an
-- OTP, so no proof row exists. The trigger then hit the `raise exception`
-- branch, which Supabase surfaces to the client as the generic message
-- "Database error saving new user".
--
-- Fix: make the OTP proof requirement conditional on signup_email_otp. When
-- OTP is disabled, a valid registration key + token (isssued by
-- validate_role_registration) is sufficient to activate the account.
-- ---------------------------------------------------------------------------

-- Ensure the flag column exists (it was added directly on the live DB; this
-- keeps fresh databases consistent too).
alter table public.platform_settings add column if not exists signup_email_otp boolean not null default true;

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
  v_otp_required boolean := false;
  v_window bigint := floor(extract(epoch from now()) / 60)::bigint;
  v_custom jsonb;
begin
  if v_slug is not null and v_token is not null then
    select * into v_reg_row from public.registration_roles where slug = v_slug and role = v_role and enabled;
    if found and public.verify_registration_token(v_slug, new.email, v_token, v_reg_row.signing_secret) then
      select coalesce(signup_email_otp, true)
      into v_otp_required
      from public.platform_settings
      where id = 1;

      if v_otp_required then
        select exists (
          select 1 from public.registration_email_verifications ev
          where ev.email = lower(new.email)
            and ev.purpose = 'role:' || v_slug
            and ev.time_window in (v_window, v_window - 1, v_window - 2)
            and ev.expires_at > now()
        ) into v_otp_ok;
      else
        v_otp_ok := true;
      end if;

      if v_otp_ok then
        v_status := 'active';
        -- Only super_admin and main_admin require MFA
        if v_role in ('super_admin', 'main_admin') then
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
