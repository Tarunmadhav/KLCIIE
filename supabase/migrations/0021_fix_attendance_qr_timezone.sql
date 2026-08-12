-- ============================================================================
-- KL CIIE Platform V2 — 0021: restore attendance QR "event started" timezone fix
-- 0010 fixed the timezone bug, but 0020 (multi-round attendance) recreated
-- get_my_event_attendance_qr with the naive comparison again:
--     now() >= (start_date::timestamp + start_time::time)
-- start_date/start_time are entered in India local time (Asia/Kolkata), while
-- now() is UTC, so an event starting at 13:31 IST was treated as "not started"
-- until ~13:31 UTC (5.5 hours later). This restores the Asia/Kolkata
-- interpretation while keeping the multi-round behaviour from 0020.
-- ============================================================================

create or replace function public.get_my_event_attendance_qr(p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_started boolean;
  v_registered boolean;
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
  select exists(
    select 1 from public.event_registrations r
    where r.event_id = p_event_id and r.member_id = v_uid and r.status <> 'cancelled'
  ) into v_registered;
  if not v_registered then
    return jsonb_build_object('error', 'You are not registered for this event.');
  end if;

  v_started := now() >= (v_event.start_date::date + coalesce(nullif(v_event.start_time, ''), '00:00')::time) at time zone 'Asia/Kolkata';

  if not v_started then
    return jsonb_build_object(
      'started', false, 'attendance_rounds', v_event.attendance_rounds,
      'event_title', v_event.title, 'start_date', v_event.start_date, 'start_time', v_event.start_time
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
    'attendance_rounds', v_event.attendance_rounds,
    'rounds', coalesce(v_rows, '[]'::jsonb),
    'event_title', v_event.title, 'start_date', v_event.start_date, 'start_time', v_event.start_time
  );
end;
$$;

grant execute on function public.get_my_event_attendance_qr(uuid) to authenticated;
