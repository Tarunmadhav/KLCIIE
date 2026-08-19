-- 0043: top-admin event registration override and post-event attendance
-- Public registration keeps its deadline/event-window checks. These functions
-- are the only supported admin-panel path for the two exceptions.

create or replace function public.admin_register_event_user(
  p_event_id uuid,
  p_member_id uuid
)
returns public.event_registrations
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_event public.events%rowtype;
  v_reg public.event_registrations;
begin
  if not exists (
    select 1 from public.profiles
    where id = v_admin_id and status = 'active' and role in ('super_admin', 'main_admin')
  ) then
    raise exception 'Only Super Admin and Main Admin can register users after registration closes';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status in ('cancelled', 'draft') then
    raise exception 'Event is not available for registration';
  end if;

  select * into v_profile from public.profiles where id = p_member_id;
  if not found or v_profile.status = 'disabled' then
    raise exception 'User not found or disabled';
  end if;

  if exists (
    select 1 from public.event_registrations
    where event_id = p_event_id and member_id = p_member_id and status <> 'cancelled'
  ) then
    raise exception 'This user is already registered for the event';
  end if;

  if (select count(*) from public.event_registrations where event_id = p_event_id and status <> 'cancelled') >= v_event.seats then
    raise exception 'Event is full';
  end if;

  insert into public.event_registrations
    (event_id, member_id, attendee_name, email, phone, department, year_of_study, registration_code, form_data, status)
  values
    (p_event_id, p_member_id, coalesce(v_profile.full_name, v_profile.email, 'CIIE User'),
     v_profile.email, v_profile.phone, v_profile.department, v_profile.year_of_study,
     public.next_registration_code(), jsonb_build_object('registered_by_admin', v_admin_id), 'confirmed')
  returning * into v_reg;

  perform public.log_admin_event(
    'Registration Created After Deadline', 'registration', v_reg.id::text,
    jsonb_build_object('event_id', p_event_id, 'member_id', p_member_id)
  );
  return v_reg;
end;
$$;

grant execute on function public.admin_register_event_user(uuid, uuid) to authenticated;

create or replace function public.admin_set_attendance(
  p_event_id uuid,
  p_registration_id uuid,
  p_round integer default 1,
  p_status text default 'present'
)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_reg public.event_registrations%rowtype;
  v_att public.attendance;
begin
  if not public.is_admin(v_admin_id) then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('present', 'absent') then
    raise exception 'Invalid attendance status';
  end if;
  if p_round < 1 then
    raise exception 'Invalid attendance round';
  end if;

  select * into v_reg from public.event_registrations
  where id = p_registration_id and event_id = p_event_id and status <> 'cancelled';
  if not found then
    raise exception 'Registration not found';
  end if;

  insert into public.attendance
    (event_id, registration_id, member_id, round, status, method, marked_by)
  values
    (p_event_id, p_registration_id, v_reg.member_id, p_round, p_status, 'manual', v_admin_id)
  on conflict (registration_id, round) do update set
    status = excluded.status, member_id = excluded.member_id,
    method = 'manual', marked_by = excluded.marked_by, marked_at = now()
  returning * into v_att;

  perform public.log_admin_event(
    'Attendance Updated From Admin Panel', 'attendance', v_att.id::text,
    jsonb_build_object('event_id', p_event_id, 'registration_id', p_registration_id,
                       'round', p_round, 'status', p_status)
  );
  return v_att;
end;
$$;

grant execute on function public.admin_set_attendance(uuid, uuid, integer, text) to authenticated;

-- Allows an admin scanner to use a CIIE member QR after the event window has
-- ended. Public/member scanners continue to use mark_attendance and retain
-- the normal event-window restriction.
create or replace function public.admin_mark_attendance_code(
  p_event_id uuid,
  p_member_code text,
  p_round integer default 1
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_member_id uuid;
  v_registration_id uuid;
  v_att public.attendance%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select member_id into v_member_id from public.event_member_qr_codes
  where event_id = p_event_id and code = p_member_code
  limit 1;
  if v_member_id is null then
    select member_id into v_member_id from public.member_qr_codes where code = p_member_code limit 1;
  end if;
  if v_member_id is null then
    raise exception 'Invalid attendance code';
  end if;

  select id into v_registration_id from public.event_registrations
  where event_id = p_event_id and member_id = v_member_id and status <> 'cancelled'
  order by created_at desc limit 1;
  if v_registration_id is null then
    raise exception 'No student registered for this event';
  end if;

  if exists (
    select 1 from public.attendance
    where registration_id = v_registration_id and round = p_round and status = 'present'
  ) then
    select * into v_att from public.attendance
    where registration_id = v_registration_id and round = p_round and status = 'present'
    limit 1;
    return jsonb_build_object('duplicate', true, 'member_id', v_member_id,
      'registration_code', (select registration_code from public.event_registrations where id = v_registration_id),
      'round', p_round, 'status', 'present', 'marked_at', v_att.marked_at);
  end if;

  insert into public.attendance (event_id, registration_id, member_id, round, status, method, marked_by)
  values (p_event_id, v_registration_id, v_member_id, p_round, 'present', 'member_qr', auth.uid())
  on conflict (registration_id, round) do update set
    status = 'present', method = 'member_qr', marked_by = auth.uid(), marked_at = now()
  returning * into v_att;

  return jsonb_build_object('duplicate', false, 'member_id', v_member_id,
    'registration_code', (select registration_code from public.event_registrations where id = v_registration_id),
    'round', p_round, 'status', 'present', 'marked_at', v_att.marked_at);
end;
$$;

grant execute on function public.admin_mark_attendance_code(uuid, text, integer) to authenticated;
