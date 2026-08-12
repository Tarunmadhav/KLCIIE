-- ---------------------------------------------------------------------------
-- IS_CIIE_MEMBER — active CIIE members only
-- ---------------------------------------------------------------------------
create or replace function public.is_ciie_member(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.status = 'active' and p.role = 'member_ciie'
  );
$$;

grant execute on function public.is_ciie_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- MARK ATTENDANCE — now also allowed for CIIE members so they can scan
-- attendee / member QR codes at events (via the member "Scan QR" page).
-- Admin and member_ciie are both authorized.
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
  if not (public.is_admin() or public.is_ciie_member()) then
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

grant execute on function public.mark_attendance(uuid, text, text, text, uuid) to authenticated;
