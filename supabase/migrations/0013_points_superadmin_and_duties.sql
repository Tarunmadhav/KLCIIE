-- ============================================================================
-- KL CIIE Platform V2 — 0013: super-admin points + CIIE duties
-- 1) Points may only be awarded/revoked by the super admin (super_admin or
--    main_admin) with MFA (aal2). Non-super admins lose the award UI & RPC.
-- 2) Duties: admin creates a duty, uploads one or more files (private bucket),
--    and assigns members. Files are readable only by logged-in members in
--    their CIIE portal.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- points_admin(): true only for super_admin/main_admin WITH completed MFA.
-- ---------------------------------------------------------------------------
create or replace function public.points_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role in ('super_admin', 'main_admin')
  ) and (auth.jwt() ->> 'aal') = 'aal2';
$$;

-- Restrict manual awarding to the super admin only.
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

drop policy if exists points_admin_insert on public.member_points_transactions;
create policy points_admin_insert on public.member_points_transactions
  for insert to authenticated
  with check (public.points_admin());

drop policy if exists points_admin_delete on public.member_points_transactions;
create policy points_admin_delete on public.member_points_transactions
  for delete to authenticated
  using (public.points_admin());

-- ---------------------------------------------------------------------------
-- DUTIES
-- ---------------------------------------------------------------------------
create table if not exists public.duties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  duty_date date,
  location text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.duty_assignments (
  id uuid primary key default gen_random_uuid(),
  duty_id uuid not null references public.duties(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'assigned'
    check (status in ('assigned', 'in_progress', 'completed', 'absent')),
  created_at timestamptz not null default now(),
  unique (duty_id, member_id)
);

create table if not exists public.duty_files (
  id uuid primary key default gen_random_uuid(),
  duty_id uuid not null references public.duties(id) on delete cascade,
  name text not null,
  path text not null,
  size bigint,
  content_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_duty_assignments_member on public.duty_assignments (member_id);
create index if not exists idx_duty_assignments_duty on public.duty_assignments (duty_id);

alter table public.duties enable row level security;
alter table public.duty_assignments enable row level security;
alter table public.duty_files enable row level security;

drop policy if exists duties_read on public.duties;
create policy duties_read on public.duties
  for select to authenticated
  using (true);

drop policy if exists duties_admin_write on public.duties;
create policy duties_admin_write on public.duties
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists duty_assignments_self_read on public.duty_assignments;
create policy duty_assignments_self_read on public.duty_assignments
  for select to authenticated
  using (member_id = auth.uid() or public.is_admin());

drop policy if exists duty_assignments_admin_write on public.duty_assignments;
create policy duty_assignments_admin_write on public.duty_assignments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists duty_files_read on public.duty_files;
create policy duty_files_read on public.duty_files
  for select to authenticated
  using (true);

drop policy if exists duty_files_admin_write on public.duty_files;
create policy duty_files_admin_write on public.duty_files
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- STORAGE: duties bucket (private — only authenticated members can read)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('duties', 'duties', false)
on conflict (id) do nothing;

drop policy if exists storage_duties_read on storage.objects;
create policy storage_duties_read on storage.objects
  for select to authenticated
  using (bucket_id = 'duties');

drop policy if exists storage_duties_write on storage.objects;
create policy storage_duties_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'duties' and public.is_admin());

drop policy if exists storage_duties_update on storage.objects;
create policy storage_duties_update on storage.objects
  for update to authenticated
  using (bucket_id = 'duties' and public.is_admin())
  with check (bucket_id = 'duties' and public.is_admin());

drop policy if exists storage_duties_delete on storage.objects;
create policy storage_duties_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'duties' and public.is_admin());
