-- ---------------------------------------------------------------------------
-- FIX: registration_otp_at used a 32-char alphabet ('23456789...XYZ', missing
-- '0' and '1') with BASE 34. The modulo can yield indexes 32 and 33, which are
-- out of range:
--   - the admin panel (src/lib/totp.ts) rendered them as the literal string
--     "undefined" (e.g. "4WHVundefined8"), and
--   - the database returned an empty character for the same position,
-- so the shown code and the validated code disagreed for roughly 1 in 3 codes.
-- Recreate the function with the full 34-char base34 alphabet so JS and SQL
-- always agree and never emit invalid characters.
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
  v_alphabet constant text := '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
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
  v_bin := v_bin % 1544804416::bigint;
  for v_i in 1..6 loop
    v_out := substr(v_alphabet, (v_bin % v_base)::int + 1, 1) || v_out;
    v_bin := v_bin / v_base;
  end loop;
  return v_out;
end;
$$;
