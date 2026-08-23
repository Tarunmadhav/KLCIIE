-- ============================================================================
-- KL CIIE Platform V2 — 0053: Forms for Faculty
--
-- 1) faculty_forms            — admin-built forms that faculty must fill.
--                               fields jsonb reuses the CustomFieldDef shape
--                               [{ key,label,type,required,options }] used by
--                               the registration/recruitment forms.
-- 2) faculty_form_submissions — one submission per faculty per form. The first
--                               submission time is kept in submitted_at, every
--                               resubmission refreshes updated_at so admins can
--                               track who submitted and when (both times).
-- ============================================================================

create table if not exists public.faculty_forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  status text not null default 'published' check (status in ('draft', 'published', 'closed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faculty_form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.faculty_forms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  responses jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, member_id)
);

create index if not exists idx_faculty_form_sub_form on public.faculty_form_submissions (form_id);
create index if not exists idx_faculty_form_sub_member on public.faculty_form_submissions (member_id);

alter table public.faculty_forms enable row level security;
alter table public.faculty_form_submissions enable row level security;

-- Forms: everyone logged-in can read published ones; admins manage everything.
drop policy if exists faculty_forms_admin_write on public.faculty_forms;
create policy faculty_forms_admin_write on public.faculty_forms
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists faculty_forms_read on public.faculty_forms;
create policy faculty_forms_read on public.faculty_forms
  for select to authenticated
  using (status = 'published' or public.is_admin());

-- Submissions: admins see/manage all; faculty manage their own rows only.
drop policy if exists faculty_form_subs_admin_all on public.faculty_form_submissions;
create policy faculty_form_subs_admin_all on public.faculty_form_submissions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists faculty_form_subs_read_own on public.faculty_form_submissions;
create policy faculty_form_subs_read_own on public.faculty_form_submissions
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists faculty_form_subs_write_own on public.faculty_form_submissions;
create policy faculty_form_subs_write_own on public.faculty_form_submissions
  for insert to authenticated
  with check (member_id = auth.uid());

drop policy if exists faculty_form_subs_update_own on public.faculty_form_submissions;
create policy faculty_form_subs_update_own on public.faculty_form_submissions
  for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

drop trigger if exists touch_faculty_forms on public.faculty_forms;
create trigger touch_faculty_forms before update on public.faculty_forms
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_faculty_form_submissions on public.faculty_form_submissions;
create trigger touch_faculty_form_submissions before update on public.faculty_form_submissions
  for each row execute function public.touch_updated_at();
