-- 0045: safely delete events without creating point rows referencing a
-- deleted event. Existing points remain in the immutable ledger with event_id
-- detached (null).

create or replace function public.handle_team_points()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.event_roles%rowtype;
  v_event_date date;
begin
  if TG_OP = 'INSERT' then
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
    if old.role_id is distinct from new.role_id then
      select e.start_date into v_event_date from public.events e where e.id = old.event_id;
      if v_event_date is null or v_event_date >= current_date then
        insert into public.member_points_transactions
          (member_id, event_id, activity_type, points, description, awarded_by, is_automatic, reference_type, reference_id)
        select old.member_id, old.event_id, 'event_role_reversal', -abs(t.points),
               'Event role changed/removed before event', old.created_by, true, 'event_role_reversal', old.id
        from public.member_points_transactions t
        where t.member_id = old.member_id and t.reference_type = 'event_role' and t.reference_id = old.id
        limit 1;
      end if;
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
    -- During an event cascade the parent event no longer exists. Do not create
    -- a reversal row pointing at that deleted event.
    if exists (select 1 from public.events where id = old.event_id) then
      select start_date into v_event_date from public.events where id = old.event_id;
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
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.admin_delete_event(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.admin_aal2() then
    raise exception 'Not authorized';
  end if;

  update public.member_points_transactions
  set event_id = null
  where event_id = p_event_id;

  delete from public.events where id = p_event_id;
  if not found then
    raise exception 'Event not found';
  end if;
end;
$$;

grant execute on function public.admin_delete_event(uuid) to authenticated;
