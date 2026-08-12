-- ============================================================================
-- KL CIIE Platform V2 — 0017: attendance scan details
-- CIIE members can mark attendance, but RLS prevents them from reading another
-- member's profile / registration / attendance rows directly. This security
-- definer RPC returns everything the scanner needs to display after a scan:
-- the person marked, who marked it, and when.
-- ============================================================================

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
