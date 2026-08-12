-- ============================================================================
-- KL CIIE Platform V2 — 0022: do not award points to non-member users
-- Regular users (profiles.role = 'user') who register for events are NOT CIIE
-- members. They should never earn CIIE points — not even automatic attendance
-- points. This guards every point-awarding path:
--   * handle_attendance_points (attendance trigger)
--   * handle_team_points        (event team trigger)
--   * award_points              (manual super-admin award)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ATTENDANCE -> POINTS — skip when the member is a regular user
-- ---------------------------------------------------------------------------
create or replace function public.handle_attendance_points()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_points integer;
  v_member_role text;
begin
  if new.member_id is null then
    return new;
  end if;

  select p.role into v_member_role from public.profiles p where p.id = new.member_id;
  if v_member_role = 'user' then
    return new;
  end if;

  select r.points into v_points
  from public.point_rules r
  where r.activity_type = 'attendance' and r.is_automatic and r.is_active
  order by r.created_at desc
  limit 1;

  if new.status = 'present' and v_points is not null then
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

-- ---------------------------------------------------------------------------
-- EVENT TEAM -> POINTS — skip when the member is a regular user
-- ---------------------------------------------------------------------------
create or replace function public.handle_team_points()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.event_roles%rowtype;
  v_points integer;
  v_event_date date;
  v_events_id uuid;
  v_member_role text;
begin
  select p.role into v_member_role from public.profiles p where p.id = coalesce(new.member_id, old.member_id);
  if v_member_role = 'user' then
    return coalesce(new, old);
  end if;

  if TG_OP = 'INSERT' then
    v_events_id := new.event_id;
    select e.start_date into v_event_date from public.events e where e.id = new.event_id;
    select * into v_role from public.event_roles where id = new.role_id;
    if v_role.award_points and v_role.default_points > 0 then
      insert into public.member_points_transactions
        (member_id, event_id, activity_type, points, description, awarded_by, is_automatic, reference_type, reference_id)
      values
        (new.member_id, new.event_id, 'event_role', v_role.default_points,
         'Assigned as ' || v_role.name || ' for event', new.created_by, true, 'event_role', new.id)
      on conflict do nothing;
    end if;
  elsif TG_OP = 'UPDATE' then
    v_events_id := old.event_id;
    if old.role_id is distinct from new.role_id then
      select e.start_date into v_event_date from public.events e where e.id = old.event_id;
      -- remove old role award if event hasn't happened yet
      if v_event_date is null or v_event_date >= current_date then
        insert into public.member_points_transactions
          (member_id, event_id, activity_type, points, description, awarded_by, is_automatic, reference_type, reference_id)
        select old.member_id, old.event_id, 'event_role_reversal', -abs(t.points),
               'Event role changed/removed before event', old.created_by, true, 'event_role_reversal', old.id
        from public.member_points_transactions t
        where t.member_id = old.member_id and t.reference_type = 'event_role' and t.reference_id = old.id
        limit 1;
      end if;
      -- award new role points
      select * into v_role from public.event_roles where id = new.role_id;
      if v_role.award_points and v_role.default_points > 0 then
        insert into public.member_points_transactions
          (member_id, event_id, activity_type, points, description, awarded_by, is_automatic, reference_type, reference_id)
        values
          (new.member_id, new.event_id, 'event_role', v_role.default_points,
           'Assigned as ' || v_role.name || ' for event', new.created_by, true, 'event_role', new.id)
        on conflict do nothing;
      end if;
    end if;
  elsif TG_OP = 'DELETE' then
    select e.start_date into v_event_date from public.events e where e.id = old.event_id;
    if v_event_date is null or v_event_date >= current_date then
      insert into public.member_points_transactions
        (member_id, event_id, activity_type, points, description, awarded_by, is_automatic, reference_type, reference_id)
      select old.member_id, old.event_id, 'event_role_reversal', -abs(t.points),
             'Event team assignment removed before event', old.created_by, true, 'event_role_reversal', old.id
      from public.member_points_transactions t
      where t.member_id = old.member_id and t.reference_type = 'event_role' and t.reference_id = old.id
      limit 1;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- MANUAL AWARD — refuse to award points to regular users
-- ---------------------------------------------------------------------------
create or replace function public.award_points(
  p_member_id uuid,
  p_points integer,
  p_activity_type text default 'manual',
  p_description text default null,
  p_event_id uuid default null,
  p_reference_type text default null,
  p_reference_id uuid default null
)
returns public.member_points_transactions
language plpgsql security definer set search_path = ''
as $$
declare
  v_tx public.member_points_transactions;
begin
  if not public.points_admin() then
    raise exception 'Forbidden — only super admins can award points.';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = p_member_id and p.role = 'user'
  ) then
    raise exception 'Points cannot be awarded to non-member users.';
  end if;
  if p_points = 0 then
    raise exception 'Points cannot be zero';
  end if;
  insert into public.member_points_transactions
    (member_id, event_id, activity_type, points, description, awarded_by, is_automatic, reference_type, reference_id)
  values
    (p_member_id, p_event_id, coalesce(nullif(p_activity_type, ''), 'manual'), p_points, p_description,
     auth.uid(), false, p_reference_type, p_reference_id)
  returning * into v_tx;

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'Points Awarded (Manual)', 'member', p_member_id::text,
          jsonb_build_object(
            'points', p_points,
            'activity_type', v_tx.activity_type,
            'description', p_description,
            'transaction_id', v_tx.id
          ));

  return v_tx;
end;
$$;
