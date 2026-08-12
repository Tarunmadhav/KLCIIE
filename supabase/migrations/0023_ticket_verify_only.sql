-- ============================================================================
-- KL CIIE Platform V2 — 0023: ticket codes verify only — attendance via codes
-- Tickets and attendance now use SEPARATE codes:
--   * Ticket QR / ticket code (registration_code) -> verify only. Entering a
--     ticket code in the attendance scanner must NOT mark attendance.
--   * Attendance QR (event_member_qr_codes / member_qr_codes code) -> the only
--     way to mark attendance (scanned or typed in manually).
-- This makes mark_attendance reject the p_registration_code path entirely.
-- get_scan_details still accepts registration codes for ticket verification.
-- ============================================================================

create or replace function public.mark_attendance(
  p_event_id uuid,
  p_registration_code text default null,
  p_member_code text default null,
  p_method text default 'qr',
  p_qr_event_id uuid default null,
  p_round integer default 1
)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  v_att public.attendance%rowtype;
  v_reg_id uuid;
  v_member_id uuid;
  v_qr_event uuid;
  v_round integer;
  v_max_rounds integer;
begin
  if not (public.is_admin() or public.is_ciie_member()) then
    raise exception 'Not authorized';
  end if;

  select attendance_rounds into v_max_rounds from public.events where id = p_event_id;
  if v_max_rounds is null then
    raise exception 'Event not found';
  end if;

  v_round := coalesce(p_round, 1);
  if v_round < 1 or v_round > v_max_rounds then
    raise exception 'Invalid round';
  end if;

  if p_registration_code is not null then
    raise exception 'Ticket codes are for verification only. Use the attendance QR code to mark attendance.';
  end if;

  if p_member_code is not null then
    select eq.event_id, eq.member_id, eq.round into v_qr_event, v_member_id, v_round
    from public.event_member_qr_codes eq
    where eq.code = p_member_code;
    if found then
      if (p_qr_event_id is not null and p_qr_event_id <> v_qr_event)
         or (p_qr_event_id is null and v_qr_event <> p_event_id) then
        raise exception using errcode = 'EVTMIS', message = 'Event Mismatch';
      end if;
      select id into v_reg_id
      from public.event_registrations
      where event_id = p_event_id and member_id = v_member_id and status <> 'cancelled'
      order by created_at desc limit 1;
      update public.event_member_qr_codes
      set code = encode(public.gen_random_bytes(9), 'hex'), used_at = now()
      where event_id = p_event_id and member_id = v_member_id and round = v_round;
    else
      select mq.member_id into v_member_id
      from public.member_qr_codes mq
      where mq.code = p_member_code;
      if not found then
        raise exception 'Invalid attendance code';
      end if;
      select id into v_reg_id
      from public.event_registrations
      where event_id = p_event_id and member_id = v_member_id and status <> 'cancelled'
      order by created_at desc limit 1;
    end if;
  else
    raise exception 'Missing attendance code';
  end if;

  if v_member_id is null then
    raise exception 'No CIIE member linked to this registration';
  end if;

  insert into public.attendance (event_id, registration_id, member_id, round, status, method, marked_by)
  values (p_event_id, v_reg_id, v_member_id, v_round, 'present', p_method, auth.uid())
  on conflict (registration_id, round)
  do update set status = 'present', method = excluded.method, marked_by = excluded.marked_by, marked_at = now()
  returning * into v_att;

  return v_att;
end;
$$;

grant execute on function public.mark_attendance(uuid, text, text, text, uuid, integer) to authenticated;
