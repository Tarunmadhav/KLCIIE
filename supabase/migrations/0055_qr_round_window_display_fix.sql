-- ============================================================================
-- KL CIIE Platform V2 — 0055: QR fix — hide round codes outside their window
--
-- Bug: for faculty events with round windows, get_my_event_attendance_qr used
-- the filter "(v_active_round is null OR eq.round = v_active_round OR marked)"
-- so when NO window was open (v_active_round null) every existing code — e.g.
-- a stale one from a round whose window had closed, or codes created before
-- windows were configured — was still returned and displayed.
--
-- Fix: in windowed mode return ONLY the currently-open round plus rounds
-- already marked present (history). Classic events (no windows) are unchanged.
-- ============================================================================

create or replace function public.get_my_event_attendance_qr(p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_caller_role text;
  v_is_faculty_event boolean;
  v_started boolean;
  v_closed boolean;
  v_windowed boolean;
  v_active_round integer;
  v_windows jsonb;
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

  select role into v_caller_role from public.profiles where id = v_uid;
  v_is_faculty_event := v_event.audience = 'faculty';

  if v_is_faculty_event then
    -- Faculty never register: every active faculty profile has automatic access.
    if v_caller_role is distinct from 'faculty' then
      return jsonb_build_object('error', 'This event is open to faculty only.');
    end if;
  else
    if not exists (
      select 1 from public.event_registrations r
      where r.event_id = p_event_id and r.member_id = v_uid and r.status <> 'cancelled'
    ) then
      return jsonb_build_object('error', 'You are not registered for this event.');
    end if;
  end if;

  v_started := now() >= (v_event.start_date::date + coalesce(nullif(v_event.start_time, ''), '00:00')::time) at time zone 'Asia/Kolkata';

  v_closed := v_event.status in ('completed', 'cancelled')
    or (v_event.end_date is not null
        and now() >= (v_event.end_date::date + coalesce(nullif(v_event.end_time, ''), '23:59:59')::time) at time zone 'Asia/Kolkata');

  -- Round windows configured by the admin (used for faculty events).
  select coalesce(
    jsonb_agg(jsonb_build_object('round', w.round, 'starts_at', w.starts_at, 'ends_at', w.ends_at) order by w.round),
    '[]'::jsonb
  )
  into v_windows
  from public.event_round_windows w
  where w.event_id = p_event_id;

  v_windowed := v_is_faculty_event and v_windows <> '[]'::jsonb;

  v_active_round := null;
  if v_windowed then
    select min(w.round) into v_active_round
    from public.event_round_windows w
    where w.event_id = p_event_id
      and now() >= w.starts_at and now() < w.ends_at;
  end if;

  if not v_started or v_closed then
    return jsonb_build_object(
      'started', v_started, 'closed', v_closed,
      'attendance_rounds', v_event.attendance_rounds,
      'audience', v_event.audience,
      'active_round', v_active_round,
      'round_windows', v_windows,
      'event_title', v_event.title,
      'start_date', v_event.start_date, 'start_time', v_event.start_time,
      'end_date', v_event.end_date, 'end_time', v_event.end_time
    );
  end if;

  if v_active_round is not null then
    -- Only issue a code for the round whose window is open right now.
    insert into public.event_member_qr_codes (event_id, member_id, round, code)
    values (p_event_id, v_uid, v_active_round, encode(public.gen_random_bytes(9), 'hex'))
    on conflict (event_id, member_id, round) do nothing;
  elsif not v_windowed then
    -- No windowed rounds: classic behaviour, codes for every round.
    for v_i in 1..v_event.attendance_rounds loop
      insert into public.event_member_qr_codes (event_id, member_id, round, code)
      values (p_event_id, v_uid, v_i, encode(public.gen_random_bytes(9), 'hex'))
      on conflict (event_id, member_id, round) do nothing;
    end loop;
  end if;

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

  -- Windowed events expose ONLY the open round (+ already-marked history);
  -- codes of closed/future rounds must never reach the client.
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
  where eq.event_id = p_event_id and eq.member_id = v_uid
    and (
      not v_windowed
      or eq.round = v_active_round
      or a.id is not null   -- keep already-marked rounds visible as history
    );

  return jsonb_build_object(
    'started', true,
    'closed', false,
    'attendance_rounds', v_event.attendance_rounds,
    'audience', v_event.audience,
    'active_round', v_active_round,
    'round_windows', v_windows,
    'rounds', coalesce(v_rows, '[]'::jsonb),
    'event_title', v_event.title,
    'start_date', v_event.start_date, 'start_time', v_event.start_time,
    'end_date', v_event.end_date, 'end_time', v_event.end_time
  );
end;
$$;

grant execute on function public.get_my_event_attendance_qr(uuid) to authenticated;
