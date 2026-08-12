-- ============================================================================
-- KL CIIE Platform V2 — 0003: triggers
-- Automatic point awarding, reversals, profile creation and protected fields.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- NEW USER -> profile + privacy settings + member QR code
-- New signups start as 'pending' recruits awaiting GD/Interview. Interview
-- batch alternates by signup order (1st -> Day 1, 2nd -> Day 2, ...).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'member');
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
  v_status text := 'pending';
  v_batch smallint;
  v_pending bigint;
begin
  if v_role = 'member' then
    v_role := 'member';
  elsif v_role not in ('super_admin','event_admin','member_admin','content_admin','gallery_admin','reports_admin','attendance_coordinator','mail_admin') then
    v_role := 'member';
  end if;

  if v_role <> 'member' then
    v_status := 'active';
  else
    select count(*) into v_pending from public.profiles where status = 'pending';
    v_batch := case when v_pending % 2 = 0 then 1 else 2 end;
  end if;

  insert into public.profiles (
    id, email, full_name, role, ciie_id, mfa_setup_required,
    status, interview_batch, phone, department, year_of_study
  )
  values (
    new.id, new.email, v_name, v_role, public.next_ciie_id(),
    case when v_role <> 'member' then true else false end,
    v_status, v_batch,
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'department',
    new.raw_user_meta_data ->> 'year_of_study'
  )
  on conflict (id) do nothing;

  insert into public.member_privacy_settings (member_id) values (new.id) on conflict do nothing;
  insert into public.member_qr_codes (member_id, code)
  values (new.id, encode(public.gen_random_bytes(9), 'hex'))
  on conflict (member_id) do nothing;

  if v_role <> 'member' then
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
    values (new.id, 'Admin Account Created', 'admin', new.id::text, jsonb_build_object('role', v_role));
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- PROTECTED PROFILE FIELDS
-- A member cannot escalate their own role/status/MFA flags via profile updates.
-- Non-super admins cannot disable their own mandatory MFA.
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() and (
      new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.mfa_enabled is distinct from old.mfa_enabled
      or new.mfa_setup_required is distinct from old.mfa_setup_required
      or new.email is distinct from old.email
      or new.ciie_id is distinct from old.ciie_id
  ) then
    raise exception 'Cannot modify protected profile fields';
  end if;
  if public.is_admin() and not public.is_super_admin() and old.mfa_enabled and not new.mfa_enabled then
    raise exception 'Only Super Admin can disable MFA';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ---------------------------------------------------------------------------
-- TOUCH updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_events on public.events;
create trigger touch_events before update on public.events
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_point_rules on public.point_rules;
create trigger touch_point_rules before update on public.point_rules
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_posts on public.posts;
create trigger touch_posts before update on public.posts
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_branding on public.branding_settings;
create trigger touch_branding before update on public.branding_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- ATTENDANCE -> POINTS
-- Present  -> award configured automatic 'attendance' points (once per event).
-- Absent   -> insert a reversal transaction + audit log.
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

drop trigger if exists attendance_points on public.attendance;
create trigger attendance_points
  after insert or update of status on public.attendance
  for each row execute function public.handle_attendance_points();

-- ---------------------------------------------------------------------------
-- EVENT TEAM -> POINTS
-- Assign -> award configured role points (if role has award_points enabled).
-- Removed before event date -> reversal transaction (keeps ledger immutable).
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
begin
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

drop trigger if exists team_points on public.event_team_members;
create trigger team_points
  after insert or update of role_id or delete on public.event_team_members
  for each row execute function public.handle_team_points();

-- ---------------------------------------------------------------------------
-- LAST LOGIN tracking + audit
-- ---------------------------------------------------------------------------
create or replace function public.log_admin_login()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role not in ('member', 'user') then
    update public.profiles set last_login_at = now() where id = new.id;
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id)
    values (new.id, 'Admin Login', 'admin', new.id::text);
  end if;
  return new;
end;
$$;

-- Called from the client after successful password sign-in for admin accounts.
create or replace function public.record_login(p_user_id uuid, p_success boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_success then
    update public.profiles set last_login_at = now() where id = p_user_id;
    if exists (select 1 from public.profiles where id = p_user_id and role not in ('member', 'user')) then
      insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id)
      values (p_user_id, 'Admin Login', 'admin', p_user_id::text);
    end if;
  else
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id)
    values (p_user_id, 'Failed Admin Login', 'admin', p_user_id::text);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- TOTAL POINTS AWARDED aggregate (admin dashboard)
-- ---------------------------------------------------------------------------
create or replace function public.get_points_stats()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'total_points_awarded', coalesce((select sum(points) from public.member_points_transactions where points > 0), 0),
    'total_transactions', (select count(*) from public.member_points_transactions),
    'active_members', (select count(*) from public.profiles where status = 'active'),
    'upcoming_events', (select count(*) from public.events where status = 'published' and start_date >= current_date),
    'events_conducted', (select count(*) from public.events where status = 'completed')
  );
$$;

create or replace function public.get_audit_logs(p_limit integer default 100)
returns setof public.admin_audit_logs
language sql stable security definer set search_path = ''
as $$
  select * from public.admin_audit_logs
  where public.is_admin()
  order by created_at desc
  limit p_limit;
$$;
