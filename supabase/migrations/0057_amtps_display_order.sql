-- ============================================================================
-- KL CIIE Platform V2 — 0057: AMTPS card display order
--
-- Super admins can arrange AMTPS cards (which photo/member appears first).
-- display_order drives the sequence everywhere cards are shown (/members,
-- /amtps). Existing cards keep their current relative order; newly added
-- cards go to the end automatically.
-- ============================================================================

alter table public.amtps_members add column if not exists display_order integer not null default 0;

create index if not exists idx_amtps_members_order on public.amtps_members (display_order);

-- One-time backfill: rank existing cards alphabetically (the old behaviour)
-- only while nothing has been custom-ordered yet.
do $do$
begin
  if not exists (select 1 from public.amtps_members where display_order <> 0) then
    with ranked as (
      select id, (row_number() over (order by full_name asc, created_at asc) - 1) as rn
      from public.amtps_members
    )
    update public.amtps_members m
    set display_order = r.rn
    from ranked r
    where r.id = m.id;
  end if;
end $do$;

-- New cards land at the end of the lineup automatically.
create or replace function public.fn_amtps_next_order()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.display_order = 0 then
    select coalesce(max(display_order), -1) + 1 into new.display_order from public.amtps_members;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_amtps_next_order on public.amtps_members;
create trigger trg_amtps_next_order before insert on public.amtps_members
  for each row execute function public.fn_amtps_next_order();

-- Let super admins reorder directly from the admin panel.
drop policy if exists amtps_admin_write on public.amtps_members;
create policy amtps_admin_write on public.amtps_members
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
