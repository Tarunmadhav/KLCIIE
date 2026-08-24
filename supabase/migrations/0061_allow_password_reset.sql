-- 0061: Super-admin toggle for public password reset (forgot password).
-- When off, the "Forgot password?" link is hidden and OTP resets are refused.

alter table public.platform_settings
  add column if not exists allow_password_reset boolean not null default true;

create or replace function public.reset_password_with_otp(
  p_email text,
  p_code text,
  p_new_password text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.email_otp_codes%rowtype;
  v_user_id uuid;
begin
  if not coalesce(
    (select allow_password_reset from public.platform_settings where id = 1),
    true
  ) then
    return jsonb_build_object('ok', false, 'error', 'Password reset is currently disabled. Please contact CIIE support.');
  end if;

  if p_email is null or position('@' in btrim(p_email)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid email address.');
  end if;
  if p_new_password is null or length(btrim(p_new_password)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Password must be at least 8 characters.');
  end if;
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter the 6-digit code you received by email.');
  end if;

  select * into v_row
  from public.email_otp_codes
  where lower(email) = lower(btrim(p_email))
    and purpose = 'password-reset'
    and consumed_at is null
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'No reset code was sent to this email. Please request a new one.');
  end if;
  if v_row.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'The code has expired. Please request a new one.');
  end if;
  if v_row.attempts >= 5 then
    update public.email_otp_codes set consumed_at = now() where id = v_row.id;
    return jsonb_build_object('ok', false, 'error', 'Too many wrong attempts. Please request a new code.');
  end if;

  if encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex') <> v_row.code_hash then
    update public.email_otp_codes set attempts = attempts + 1 where id = v_row.id;
    return jsonb_build_object('ok', false, 'error', 'That code is incorrect. Please check your email and try again.');
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;

  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Unable to reset the password for this email. Please contact CIIE support.');
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(btrim(p_new_password), extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;

  delete from auth.refresh_tokens where user_id = v_user_id::text;
  update public.email_otp_codes set consumed_at = now() where id = v_row.id;

  if exists (select 1 from public.profiles where id = v_user_id) then
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
    values (
      v_user_id,
      'Password Reset via OTP',
      'profile',
      v_user_id::text,
      jsonb_build_object('email', lower(btrim(p_email)))
    );
  end if;

  return jsonb_build_object('ok', true, 'error', null);
end;
$$;

grant execute on function public.reset_password_with_otp(text, text, text) to anon, authenticated;
