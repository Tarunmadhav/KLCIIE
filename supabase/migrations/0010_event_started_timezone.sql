-- ============================================================================
-- KL CIIE Platform V2 — 0010: fix attendance QR "event started" timezone check
-- Event start_date/start_time are entered in India local time (Asia/Kolkata).
-- The previous check compared them as naive UTC timestamps against now() (UTC),
-- so an event starting at 15:16 IST was treated as "not started" until 15:16 UTC
-- (~5.5 hours later). Now the naive timestamp is interpreted as Asia/Kolkata.
-- ============================================================================

create or replace function public.get_my_event_attendance_qr(p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_started boolean;
  v_code text;
  v_registered boolean;
  v_present boolean := false;
  v_marked_at timestamptz;
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

  select (status = 'present'), marked_at into v_present, v_marked_at
  from public.attendance
  where event_id = p_event_id and member_id = v_uid and status = 'present'
  order by marked_at desc limit 1;

  v_started := now() >= (v_event.start_date::date + coalesce(nullif(v_event.start_time, ''), '00:00')::time) at time zone 'Asia/Kolkata';

  if not v_started then
    return jsonb_build_object(
      'started', false, 'present', v_present,
      'event_title', v_event.title, 'start_date', v_event.start_date, 'start_time', v_event.start_time
    );
  end if;

  insert into public.event_member_qr_codes (event_id, member_id, code)
  values (p_event_id, v_uid, encode(public.gen_random_bytes(9), 'hex'))
  on conflict (event_id, member_id) do nothing;

  select eq.code into v_code
  from public.event_member_qr_codes eq
  where eq.event_id = p_event_id and eq.member_id = v_uid;

  return jsonb_build_object(
    'started', true, 'present', v_present, 'code', v_code,
    'marked_at', v_marked_at,
    'event_title', v_event.title, 'start_date', v_event.start_date, 'start_time', v_event.start_time
  );
end;
$$;
