-- 0044: link registrations made before sign-in to the matching account
-- Anonymous event registrations have no member_id. When that person later
-- signs in, link only rows whose email matches the authenticated email so the
-- member can view and use attendance QR codes for those events.

create or replace function public.link_my_event_registrations()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or auth.jwt() ->> 'email' is null then
    return 0;
  end if;

  update public.event_registrations
  set member_id = auth.uid()
  where member_id is null
    and status <> 'cancelled'
    and lower(trim(email)) = lower(trim(auth.jwt() ->> 'email'));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.link_my_event_registrations() to authenticated;
