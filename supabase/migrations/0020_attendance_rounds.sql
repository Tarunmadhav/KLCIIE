-- ============================================================================
-- KL CIIE Platform V2 — 0020: multi-round attendance
-- Events can have N attendance rounds (default 1). Members get one attendance
-- QR per round; the admin/member scanner marks one round at a time. The admin
-- panel and Excel export show per-round presence, the final attendance
-- (present only when ALL rounds are present), and present/absent round counts.
--
-- Schema changes:
--   events                     + attendance_rounds (1..30, default 1)
--   event_member_qr_codes      + round, unique (event_id, member_id, round)
--   attendance                 + round, unique (registration_id, round),
--                                unique (event_id, member_id, round)
--
-- Function changes:
--   get_my_event_attendance_qr returns attendance_rounds + a rounds array
--   mark_attendance            + p_round; round comes from the QR row when an
--                               event-member QR is scanned
--   handle_attendance_points   awards points only once per event (first present
--                               round), even across multiple rounds
--   admin_get_event_stats      present = distinct members with any present
--                               round; absent = registrations - present
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SCHEMA
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists attendance_rounds integer not null default 1;
alter table public.events
  drop constraint if exists events_attendance_rounds_check;
alter table public.events
  add constraint events_attendance_rounds_check check (attendance_rounds >= 1 and attendance_rounds <= 30);

alter table public.event_member_qr_codes
  add column if not exists round integer not null default 1;
alter table public.event_member_qr_codes
  drop constraint if exists event_member_qr_codes_event_id_member_id_key;
alter table public.event_member_qr_codes
  add constraint event_member_qr_codes_event_id_member_id_round_key
  unique (event_id, member_id, round);

alter table public.attendance
  add column if not exists round integer not null default 1;
alter table public.attendance
  drop constraint if exists attendance_registration_id_key;
alter table public.attendance
  drop constraint if exists attendance_event_id_member_id_key;
alter table public.attendance
  add constraint attendance_registration_id_round_key unique (registration_id, round);
alter table public.attendance
  add constraint attendance_event_id_member_id_round_key unique (event_id, member_id, round);
create index if not exists idx_attendance_event_round on public.attendance (event_id, round);

-- ---------------------------------------------------------------------------
-- GET MY EVENT ATTENDANCE QR — one code per round, with per-round status
-- ---------------------------------------------------------------------------
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

  v_started := now() >= (v_event.start_date::timestamp + coalesce(nullif(v_event.start_time, ''), '00:00')::time);

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

-- ---------------------------------------------------------------------------
-- MARK ATTENDANCE — +p_round. When an event-member QR is scanned the round is
-- taken from the QR row (the scanned round is the one that gets rotated).
-- ---------------------------------------------------------------------------
drop function if exists public.mark_attendance(uuid, text, text, text);
drop function if exists public.mark_attendance(uuid, text, text, text, uuid);
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
    select id, member_id into v_reg_id, v_member_id
    from public.event_registrations
    where registration_code = p_registration_code and event_id = p_event_id and status <> 'cancelled';
    if not found then
      raise exception 'Invalid registration code for this event';
    end if;
  elsif p_member_code is not null then
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

  insert into public.attendance (event_id, registration_id, member_id, round, status, method, marked_by)
  values (p_event_id, v_reg_id, v_member_id, v_round, 'present', p_method, auth.uid())
  on conflict (registration_id, round)
  do update set status = 'present', method = excluded.method, marked_by = excluded.marked_by, marked_at = now()
  returning * into v_att;

  return v_att;
end;
$$;

grant execute on function public.mark_attendance(uuid, text, text, text, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- SCAN DETAILS — include round in the returned payload
-- ---------------------------------------------------------------------------
create or replace function public.get_scan_details(
  p_event_id uuid,
  p_registration_code text default null,
  p_member_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.event_registrations%rowtype;
  v_member public.profiles%rowtype;
  v_att public.attendance%rowtype;
  v_marked_by_name text;
  v_marked_by_ciie text;
begin
  if not (public.is_admin() or public.is_ciie_member()) then
    raise exception 'Not authorized';
  end if;

  if p_registration_code is not null then
    select * into v_reg
    from public.event_registrations
    where event_id = p_event_id and registration_code = p_registration_code and status <> 'cancelled';
    if not found then
      return null;
    end if;
    if v_reg.member_id is not null then
      select * into v_member from public.profiles where id = v_reg.member_id;
    end if;
    select * into v_att
    from public.attendance
    where event_id = p_event_id and registration_id = v_reg.id
    order by marked_at desc limit 1;
  elsif p_member_id is not null then
    select * into v_member from public.profiles where id = p_member_id;
    if not found then
      return null;
    end if;
    select * into v_reg
    from public.event_registrations
    where event_id = p_event_id and member_id = p_member_id and status <> 'cancelled'
    order by created_at desc limit 1;
    select * into v_att
    from public.attendance
    where event_id = p_event_id and member_id = p_member_id and status = 'present'
    order by marked_at desc limit 1;
  else
    return null;
  end if;

  if v_att.marked_by is not null then
    select p.full_name, p.ciie_id into v_marked_by_name, v_marked_by_ciie
    from public.profiles p where p.id = v_att.marked_by;
  end if;

  return jsonb_build_object(
    'name', coalesce(v_member.full_name, v_reg.attendee_name),
    'ciie_id', v_member.ciie_id,
    'student_id', coalesce(v_member.student_id, v_reg.student_id),
    'email', coalesce(v_member.email, v_reg.email),
    'phone', coalesce(v_member.phone, v_reg.phone),
    'department', coalesce(v_member.department, v_reg.department),
    'year_of_study', coalesce(v_member.year_of_study, v_reg.year_of_study),
    'college', v_reg.college,
    'registration_code', v_reg.registration_code,
    'round', v_att.round,
    'status', v_att.status,
    'method', v_att.method,
    'marked_at', v_att.marked_at,
    'marked_by', jsonb_build_object(
      'full_name', v_marked_by_name,
      'ciie_id', v_marked_by_ciie
    )
  );
end;
$$;

grant execute on function public.get_scan_details(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- ATTENDANCE -> POINTS — award only once per event (first present round)
-- ---------------------------------------------------------------------------
create or replace function public.handle_attendance_points()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_points integer;
begin
  if new.member_id is null then
    return new;
  end if;

  select r.points into v_points
  from public.point_rules r
  where r.activity_type = 'attendance' and r.is_automatic and r.is_active
  order by r.created_at desc
  limit 1;

  if new.status = 'present' and v_points is not null
     and not exists (
       select 1 from public.attendance a
       where a.event_id = new.event_id and a.member_id = new.member_id
         and a.status = 'present' and a.id <> new.id
     ) then
    insert into public.member_points_transactions
      (member_id, event_id, activity_type, points, description, awarded_by, is_automatic, reference_type, reference_id)
    values
      (new.member_id, new.event_id, 'attendance', v_points, 'Event attendance (present)', new.marked_by, true, 'attendance', new.id)
    on conflict do nothing;
  elsif old.status = 'present' and new.status = 'absent' and v_points is not null then
    if exists (
      select 1 from public.member_points_transactions t
      where t.member_id = new.member_id and t.reference_type = 'attendance' and t.reference_id = new.id
    ) then
      insert into public.member_points_transactions
        (member_id, event_id, activity_type, points, description, awarded_by, is_automatic, reference_type, reference_id)
      values
        (new.member_id, new.event_id, 'attendance_correction', -v_points,
         'Attendance corrected from present to absent', new.marked_by, true, 'attendance_correction', new.id);

      insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
      values (new.marked_by, 'Attendance Corrected', 'attendance', new.id::text,
              jsonb_build_object('member_id', new.member_id, 'event_id', new.event_id, 'points_adjusted', -v_points));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_points on public.attendance;
create trigger attendance_points
  after insert or update of status on public.attendance
  for each row execute function public.handle_attendance_points();

-- ---------------------------------------------------------------------------
-- ADMIN EVENT STATS — present = distinct members present in any round;
-- absent = registrations not present; + attendance_rounds
-- (returns-table signature changed -> must DROP before recreating)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_get_event_stats();
create or replace function public.admin_get_event_stats()
returns table (
  event_id uuid, title text, status text, start_date date,
  attendance_rounds integer,
  registrations bigint, present bigint, absent bigint, team_size bigint, certificates bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    id, title, status, start_date, attendance_rounds,
    (select count(*) from public.event_registrations r where r.event_id = e.id) as registrations,
    (select count(*) from (
       select 1 from public.attendance a
       where a.event_id = e.id and a.status = 'present'
       group by a.member_id
     ) p) as present,
    greatest(
      (select count(*) from public.event_registrations r where r.event_id = e.id)
      - (select count(*) from (
           select 1 from public.attendance a
           where a.event_id = e.id and a.status = 'present'
           group by a.member_id
         ) p),
      0
    ) as absent,
    (select count(*) from public.event_team_members t where t.event_id = e.id) as team_size,
    (select count(*) from public.certificates c where c.event_id = e.id) as certificates
  from public.events e
  where public.is_admin()
  order by e.start_date desc;
$$;

grant execute on function public.admin_get_event_stats() to authenticated;
