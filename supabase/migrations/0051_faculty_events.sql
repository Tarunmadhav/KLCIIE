-- ============================================================================
-- KL CIIE Platform V2 — 0051: Faculty role + Faculty Events
--
-- 1) FACULTY ROLE
--    New profiles.role value 'faculty'. Faculty users get their own panel
--    (/faculty) and never register for faculty events — access is automatic.
--
-- 2) EVENTS.AUDIENCE
--    events.audience: 'members' (default, unchanged behaviour) or 'faculty'.
--    Faculty events are excluded from public listings and managed from the
--    admin "Faculty Events" sidebar panel.
--
-- 3) AUTO REGISTRATION
--    Publishing a faculty event auto-creates a confirmed registration for
--    every active faculty profile (no registration step, seats ignored).
--    A new/updated faculty profile is auto-registered into all published
--    faculty events.
--
-- 4) ROUND WINDOWS (event_round_windows)
--    For each attendance round of an event the admin can set a start/end
--    timestamp. For faculty events with configured windows:
--      * get_my_event_attendance_qr only issues/shows the QR of the round
--        whose window contains now() (plus rounds already marked present),
--      * mark_attendance rejects scans outside that round's window.
--    Events without configured windows behave exactly as before.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) FACULTY ROLE
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in (
    'user', 'member', 'member_ciie', 'faculty',
    'super_admin', 'main_admin',
    'event_admin', 'member_admin', 'content_admin', 'gallery_admin',
    'reports_admin', 'attendance_coordinator', 'mail_admin'
  ));

-- ---------------------------------------------------------------------------
-- 2) EVENTS.AUDIENCE
-- ---------------------------------------------------------------------------
alter table public.events add column if not exists audience text not null default 'members';
alter table public.events drop constraint if exists events_audience_check;
alter table public.events
  add constraint events_audience_check check (audience in ('members', 'faculty'));

-- ---------------------------------------------------------------------------
-- 3) AUTO REGISTRATION TRIGGERS
-- ---------------------------------------------------------------------------
create or replace function public.fn_auto_register_faculty_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.audience = 'faculty' and new.status = 'published' then
    insert into public.event_registrations
      (event_id, member_id, attendee_name, email, phone, department, year_of_study,
       student_id, registration_code, form_data, status)
    select
      new.id, p.id,
      coalesce(nullif(p.full_name, ''), p.email, 'Faculty'),
      p.email, p.phone, p.department, p.year_of_study, p.student_id,
      public.next_registration_code(),
      jsonb_build_object('auto_registered', true, 'audience', 'faculty'),
      'confirmed'
    from public.profiles p
    where p.role = 'faculty'
      and p.status <> 'disabled'
      and not exists (
        select 1 from public.event_registrations r
        where r.event_id = new.id and r.member_id = p.id and r.status <> 'cancelled'
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_register_faculty_event on public.events;
create trigger trg_auto_register_faculty_event
after insert or update of audience, status on public.events
for each row execute function public.fn_auto_register_faculty_event();

create or replace function public.fn_auto_register_new_faculty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'faculty' and new.status <> 'disabled' then
    insert into public.event_registrations
      (event_id, member_id, attendee_name, email, phone, department, year_of_study,
       student_id, registration_code, form_data, status)
    select
      e.id, new.id,
      coalesce(nullif(new.full_name, ''), new.email, 'Faculty'),
      new.email, new.phone, new.department, new.year_of_study, new.student_id,
      public.next_registration_code(),
      jsonb_build_object('auto_registered', true, 'audience', 'faculty'),
      'confirmed'
    from public.events e
    where e.audience = 'faculty'
      and e.status = 'published'
      and not exists (
        select 1 from public.event_registrations r
        where r.event_id = e.id and r.member_id = new.id and r.status <> 'cancelled'
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_register_new_faculty on public.profiles;
create trigger trg_auto_register_new_faculty
after insert or update of role, status on public.profiles
for each row execute function public.fn_auto_register_new_faculty();

-- ---------------------------------------------------------------------------
-- 4) ROUND WINDOWS
-- ---------------------------------------------------------------------------
create table if not exists public.event_round_windows (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  round integer not null check (round >= 1),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at),
  unique (event_id, round)
);
create index if not exists idx_round_windows_event on public.event_round_windows (event_id);

alter table public.event_round_windows enable row level security;

drop policy if exists "event_round_windows_admin_write" on public.event_round_windows;
create policy "event_round_windows_admin_write" on public.event_round_windows
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "event_round_windows_read" on public.event_round_windows;
create policy "event_round_windows_read" on public.event_round_windows
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 5) MY EVENT ATTENDANCE QR — faculty bypass + round windows
-- ---------------------------------------------------------------------------
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

  v_active_round := null;
  if v_is_faculty_event and v_windows <> '[]'::jsonb then
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
  elsif not (v_is_faculty_event and v_windows <> '[]'::jsonb) then
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
      v_active_round is null
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

-- ---------------------------------------------------------------------------
-- 6) MARK ATTENDANCE — enforce the round window for faculty events
-- ---------------------------------------------------------------------------
create or replace function public.mark_attendance(
  p_event_id uuid,
  p_registration_code text default null,
  p_member_code text default null,
  p_method text default 'qr',
  p_qr_event_id uuid default null,
  p_round integer default 1
)
returns jsonb
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
  v_audience text;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_reg_code text;
  v_existing_marked_at timestamptz;
  v_existing_marked_by uuid;
  v_existing_method text;
  v_marked_by_name text;
  v_marked_by_ciie text;
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
         e.audience,
         (e.start_date::date + coalesce(nullif(e.start_time, ''), '00:00')::time) at time zone 'Asia/Kolkata',
         case when e.end_date is not null
              then (e.end_date::date + coalesce(nullif(e.end_time, ''), '23:59:59')::time) at time zone 'Asia/Kolkata'
              else null end
  into v_status, v_audience, v_start_ts, v_end_ts
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
      set code = encode(public.gen_random_bytes(9), 'hex'), used_at = now(), code_issued_at = now()
      where event_id = p_event_id and member_id = v_member_id and round = v_round;
    else
      select mq.member_id into v_member_id
      from public.member_qr_codes mq
      where mq.code = p_member_code;
      if not found then
        raise exception 'Invalid or expired attendance code';
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

  -- Faculty events with configured round windows only accept scans while the
  -- scanned round's window is open.
  if v_audience = 'faculty'
     and exists (select 1 from public.event_round_windows w where w.event_id = p_event_id)
     and not exists (
       select 1 from public.event_round_windows w
       where w.event_id = p_event_id and w.round = v_round
         and now() >= w.starts_at and now() < w.ends_at
     ) then
    raise exception 'Attendance for this round is not open right now';
  end if;

  -- Duplicate scan: this member is already present for the round. Report the
  -- ORIGINAL scan time and scanner instead of overwriting them.
  select status, marked_at, marked_by, method
  into v_status, v_existing_marked_at, v_existing_marked_by, v_existing_method
  from public.attendance
  where event_id = p_event_id and member_id = v_member_id and round = v_round and status = 'present'
  order by marked_at desc limit 1;
  if found then
    if v_existing_marked_by is not null then
      select p.full_name, p.ciie_id into v_marked_by_name, v_marked_by_ciie
      from public.profiles p where p.id = v_existing_marked_by;
    end if;
    select r.registration_code into v_reg_code
    from public.event_registrations r where r.id = v_reg_id;
    return jsonb_build_object(
      'duplicate', true,
      'member_id', v_member_id,
      'round', v_round,
      'registration_code', v_reg_code,
      'status', 'present',
      'method', v_existing_method,
      'marked_at', v_existing_marked_at,
      'marked_by', jsonb_build_object('full_name', v_marked_by_name, 'ciie_id', v_marked_by_ciie)
    );
  end if;

  insert into public.attendance (event_id, registration_id, member_id, round, status, method, marked_by)
  values (p_event_id, v_reg_id, v_member_id, v_round, 'present', p_method, auth.uid())
  on conflict (registration_id, round)
  do update set status = 'present', method = excluded.method, marked_by = excluded.marked_by, marked_at = now()
  returning * into v_att;

  select r.registration_code into v_reg_code
  from public.event_registrations r where r.id = v_att.registration_id;

  if v_att.marked_by is not null then
    select p.full_name, p.ciie_id into v_marked_by_name, v_marked_by_ciie
    from public.profiles p where p.id = v_att.marked_by;
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'member_id', v_att.member_id,
    'round', v_att.round,
    'registration_code', v_reg_code,
    'status', v_att.status,
    'method', v_att.method,
    'marked_at', v_att.marked_at,
    'marked_by', jsonb_build_object('full_name', v_marked_by_name, 'ciie_id', v_marked_by_ciie)
  );
end;
$$;

grant execute on function public.mark_attendance(uuid, text, text, text, uuid, integer) to authenticated;
