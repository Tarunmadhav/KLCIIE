-- 0049: bulk force-register for the admin "Force Register" panel.
-- Same rules as admin_register_event_user (super/main admin only, skips
-- deadline/registration_enabled/published checks, keeps duplicate + seat
-- guards) but processes a list of members in one call and reports per-member
-- results. Each created registration gets a fresh registration_code, so the
-- member's QR attendance ticket works exactly like a manual registration.

create or replace function public.admin_force_register_event_users(
  p_event_id uuid,
  p_member_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_event public.events%rowtype;
  v_profile public.profiles%rowtype;
  v_reg public.event_registrations;
  v_member_id uuid;
  v_used integer;
  v_registered integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = v_admin_id and status = 'active' and role in ('super_admin', 'main_admin')
  ) then
    raise exception 'Only Super Admin and Main Admin can force register users';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status in ('cancelled', 'draft') then
    raise exception 'Event is not available for registration';
  end if;

  select count(*) into v_used
  from public.event_registrations
  where event_id = p_event_id and status <> 'cancelled';

  foreach v_member_id in array p_member_ids loop
    begin
      if v_member_id is null then
        continue;
      end if;

      select * into v_profile from public.profiles where id = v_member_id;
      if not found or v_profile.status = 'disabled' then
        v_results := v_results || jsonb_build_object(
          'member_id', v_member_id, 'ok', false, 'error', 'User not found or disabled');
        continue;
      end if;

      if exists (
        select 1 from public.event_registrations
        where event_id = p_event_id and member_id = v_member_id and status <> 'cancelled'
      ) then
        v_results := v_results || jsonb_build_object(
          'member_id', v_member_id, 'ok', false, 'error', 'Already registered');
        continue;
      end if;

      if v_used >= v_event.seats then
        v_results := v_results || jsonb_build_object(
          'member_id', v_member_id, 'ok', false, 'error', 'Event is full');
        continue;
      end if;

      insert into public.event_registrations
        (event_id, member_id, attendee_name, email, phone, department, year_of_study,
         student_id, registration_code, form_data, status)
      values
        (p_event_id, v_member_id,
         coalesce(v_profile.full_name, v_profile.email, 'CIIE User'),
         v_profile.email, v_profile.phone, v_profile.department, v_profile.year_of_study,
         v_profile.student_id,
         public.next_registration_code(),
         jsonb_build_object('registered_by_admin', v_admin_id, 'force_registered', true),
         'confirmed')
      returning * into v_reg;

      v_used := v_used + 1;
      v_registered := v_registered + 1;
      v_results := v_results || jsonb_build_object(
        'member_id', v_member_id, 'ok', true,
        'registration_id', v_reg.id,
        'registration_code', v_reg.registration_code);
    exception when others then
      v_results := v_results || jsonb_build_object(
        'member_id', v_member_id, 'ok', false, 'error', sqlerrm);
    end;
  end loop;

  if v_registered > 0 then
    perform public.log_admin_event(
      'Members Force Registered', 'event', p_event_id::text,
      jsonb_build_object('count', v_registered));
  end if;

  return jsonb_build_object('results', v_results, 'registered', v_registered);
end;
$$;

grant execute on function public.admin_force_register_event_users(uuid, uuid[]) to authenticated;
