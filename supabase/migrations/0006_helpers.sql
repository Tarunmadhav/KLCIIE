-- ============================================================================
-- KL CIIE Platform V2 — 0006: login audit helpers
-- ============================================================================

-- Log a FAILED admin login attempt by email (called by the client).
-- Only admin accounts are logged; members are ignored.
create or replace function public.log_failed_admin_login(p_email text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from public.profiles where lower(email) = lower(p_email) and role not in ('member', 'user');
  if v_user_id is null then
    return;
  end if;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id)
  values (v_user_id, 'Failed Admin Login', 'admin', v_user_id::text);
end;
$$;
grant execute on function public.log_failed_admin_login(text) to anon, authenticated;

-- Public-safe event registration counts (anon cannot read event_registrations).
create or replace function public.get_event_counts()
returns table (event_id uuid, registrations bigint)
language sql stable security definer set search_path = ''
as $$
  select r.event_id, count(*)::bigint
  from public.event_registrations r
  join public.events e on e.id = r.event_id
  where e.status = 'published' and r.status <> 'cancelled'
  group by r.event_id;
$$;
grant execute on function public.get_event_counts() to anon, authenticated;

-- Ticket lookup for the current user (or admin).
create or replace function public.get_my_ticket(p_registration_id uuid)
returns public.event_registrations
language sql stable security definer set search_path = ''
as $$
  select r.*
  from public.event_registrations r
  where r.id = p_registration_id
    and (r.member_id = auth.uid()
         or r.email = (select auth.jwt() ->> 'email')
         or public.is_admin());
$$;
grant execute on function public.get_my_ticket(uuid) to authenticated;
