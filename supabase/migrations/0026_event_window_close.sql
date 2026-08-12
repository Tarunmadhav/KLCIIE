-- ============================================================================
-- KL CIIE Platform V2 — 0026: close attendance after the event window
-- Previously get_my_event_attendance_qr only checked the event START time, so
-- a single-day event (same start/end date) stayed "open" and kept issuing
-- attendance QRs forever after the end time passed. mark_attendance had no
-- time-window check at all, so scanning was allowed at any time.
--
-- Now:
--   * get_my_event_attendance_qr returns closed = true once the event ends
--     (end_date/end_time passed, or status = 'completed'/'cancelled') and
--     stops issuing QR codes.
--   * mark_attendance enforces the event window: rejects scans before the
--     start time and after the end time / when the event is completed or
--     cancelled.
-- Times are interpreted in Asia/Kolkata (the timezone used on the event form).
-- ============================================================================

create or replace function public.get_my_event_attendance_qr(p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_started boolean;
  v_closed boolean;
  v_rows jsonb;
  v_i integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('error', 'Event not found.');
  end if;
  if not exists (
    select 1 from public.event_registrations r
    where r.event_id = p_event_id and r.member_id = v_uid and r.status <> 'cancelled'
  ) then
    return jsonb_build_object('error', 'You are not registered for this event.');
  end if;

  v_started := now() >= (v_event.start_date::date + coalesce(nullif(v_event.start_time, ''), '00:00')::time) at time zone 'Asia/Kolkata';

  v_closed := v_event.status in ('completed', 'cancelled')
    or (v_event.end_date is not null
        and now() >= (v_event.end_date::date + coalesce(nullif(v_event.end_time, ''), '23:59:59')::time) at time zone 'Asia/Kolkata');

  if not v_started or v_closed then
    return jsonb_build_object(
      'started', v_started, 'closed', v_closed,
      'attendance_rounds', v_event.attendance_rounds,
      'event_title', v_event.title,
      'start_date', v_event.start_date, 'start_time', v_event.start_time,
      'end_date', v_event.end_date, 'end_time', v_event.end_time
    );
  end if;

  for v_i in 1..v_event.attendance_rounds loop
    insert into public.event_member_qr_codes (event_id, member_id, round, code)
    values (p_event_id, v_uid, v_i, encode(public.gen_random_bytes(9), 'hex'))
    on conflict (event_id, member_id, round) do nothing;
  end loop;

  select jsonb_agg(
    jsonb_build_object(
      'round', eq.round,
      'code', eq.code,
      'used', eq.used_at is not null,
      'status', coalesce(a.status, 'absent'),
      'method', a.method,
      'marked_at', a.marked_at
    ) order by eq.round
  )
  into v_rows
  from public.event_member_qr_codes eq
  left join public.attendance a
    on a.event_id = eq.event_id and a.member_id = eq.member_id and a.round = eq.round
  where eq.event_id = p_event_id and eq.member_id = v_uid;

  return jsonb_build_object(
    'started', true,
    'closed', false,
    'attendance_rounds', v_event.attendance_rounds,
    'rounds', coalesce(v_rows, '[]'::jsonb),
    'event_title', v_event.title,
    'start_date', v_event.start_date, 'start_time', v_event.start_time,
    'end_date', v_event.end_date, 'end_time', v_event.end_time
  );
end;
$$;

grant execute on function public.get_my_event_attendance_qr(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- MARK ATTENDANCE — enforce the event window
-- ---------------------------------------------------------------------------
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
  v_status text;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
begin
  if not (public.is_admin() or public.is_ciie_member()) then
    raise exception 'Not authorized';
  end if;

  select attendance_rounds into v_max_rounds from public.events where id = p_event_id;
  if v_max_rounds is null then
    raise exception 'Event not found';
  end if;

  -- Event window in Asia/Kolkata local time (same timezone as the event form).
  select e.status,
         (e.start_date::date + coalesce(nullif(e.start_time, ''), '00:00')::time) at time zone 'Asia/Kolkata',
         case when e.end_date is not null
              then (e.end_date::date + coalesce(nullif(e.end_time, ''), '23:59:59')::time) at time zone 'Asia/Kolkata'
              else null end
  into v_status, v_start_ts, v_end_ts
  from public.events e where e.id = p_event_id;

  if v_status in ('completed', 'cancelled') or (v_end_ts is not null and now() >= v_end_ts) then
    raise exception 'Event closed';
  end if;
  if now() < v_start_ts then
    raise exception 'Event has not started yet';
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
        raise exception using errcode = 'EVTMIS', message = 'No student registered for this event';
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
