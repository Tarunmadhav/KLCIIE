-- ============================================================================
-- 0059: Password reset via email OTP
--
-- reset_password_with_otp(email, code, new_password):
--   1. Validates the 6-digit OTP against public.email_otp_codes
--      (purpose = 'password-reset', the same codes the send-recruit-email
--      edge function emails). Expiry + max-5-wrong-attempts rules match
--      verify_email_otp.
--   2. Consumes the code (single use) and updates auth.users.encrypted_password.
--   3. Revokes all refresh tokens so every other session must log in again.
--   4. Writes an audit entry when a profile row exists for the user.
--
-- Callable by anon (the whole point — the requester has forgotten their
-- password), gated by possession of a fresh, valid, single-use OTP.
-- ============================================================================

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

  if encode(public.digest(upper(btrim(p_code)), 'sha256'), 'hex') <> v_row.code_hash then
    update public.email_otp_codes set attempts = attempts + 1 where id = v_row.id;
    return jsonb_build_object('ok', false, 'error', 'That code is incorrect. Please check your email and try again.');
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;

  if v_user_id is null then
    -- Do NOT consume the code; generic message avoids account enumeration.
    return jsonb_build_object('ok', false, 'error', 'Unable to reset the password for this email. Please contact CIIE support.');
  end if;

  update public.email_otp_codes set consumed_at = now() where id = v_row.id;

  update auth.users
  set encrypted_password = crypt(btrim(p_new_password), gen_salt('bf')),
      updated_at = now()
  where id = v_user_id;

  -- Force re-login everywhere with the old credentials.
  delete from auth.refresh_tokens where user_id = v_user_id;

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
