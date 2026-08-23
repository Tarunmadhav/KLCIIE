-- ============================================================================
-- KL CIIE Platform V2 — 0050: attendance QR rotation window 100s -> 60s
--
-- Recreates get_my_event_attendance_qr so unused codes rotate after 60
-- seconds instead of 100 seconds. The client countdown (QR_ROTATE_MS) must
-- match this window.
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

  -- Rotate unused codes that were issued more than 60 seconds ago so a
  -- screenshotted QR expires quickly after it was captured. Used codes keep
  -- their rotated value (already invalidated by the scanner).
  update public.event_member_qr_codes eq
  set code = encode(public.gen_random_bytes(9), 'hex'),
      code_issued_at = now()
  where eq.event_id = p_event_id
    and eq.member_id = v_uid
    and eq.used_at is null
    and now() - eq.code_issued_at >= interval '60 seconds';

  select jsonb_agg(
    jsonb_build_object(
      'round', eq.round,
      'code', eq.code,
      'issued_at', eq.code_issued_at,
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
