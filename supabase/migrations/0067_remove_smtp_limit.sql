-- ============================================================================
-- KL CIIE Platform V2 — 0067: remove the 10-account SMTP limit
--
-- The save_smtp_settings() RPC previously rejected batches larger than 10.
-- This migration lifts that restriction so the admin can configure as many
-- Gmail SMTP accounts as needed for failover and round-robin sending.
-- ============================================================================

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
