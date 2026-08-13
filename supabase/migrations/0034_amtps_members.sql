-- ============================================================================
-- KL CIIE Platform V2 — 0034: AMTPS member display cards
--
-- AMTPS is a simple public "showcase our team" directory. A super admin adds
-- people here (ALL fields optional — no login account is created and the
-- profiles / main member directory are untouched). Added people appear ONLY on:
--   1. the AMTPS admin page (/admin/amtps) where they can be edited/deleted
--   2. the public /members page as square cards (photo + student id + position);
--      clicking a card opens full details.
-- ============================================================================

create table if not exists public.amtps_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default '',
  email text,
  student_id text,
  department text,
  year_of_study text,
  position text,
  domain text,
  avatar_url text,
  telegram text,
  github text,
  linkedin text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.amtps_members enable row level security;

-- Public read: the /members page renders these cards.
drop policy if exists amtps_public_read on public.amtps_members;
create policy amtps_public_read on public.amtps_members
  for select to anon, authenticated
  using (true);

-- No direct insert/update/delete policies: writes go through the security
-- definer RPCs below (super admin + MFA only).

-- ---------------------------------------------------------------------------
-- admin_add_amtps_member: super admin creates a display card.
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_amtps_member(
  p_full_name text default null,
  p_email text default null,
  p_student_id text default null,
  p_department text default null,
  p_year_of_study text default null,
  p_position text default null,
  p_domain text default null,
  p_avatar_url text default null,
  p_telegram text default null,
  p_github text default null,
  p_linkedin text default null,
  p_contact_email text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_id uuid;
begin
  if v_admin_id is null then
    raise exception 'Not authenticated';
  end if;
  if not (public.is_super_admin(v_admin_id) or exists (select 1 from public.profiles where id = v_admin_id and status = 'active' and role = 'main_admin')) then
    return jsonb_build_object('error', 'Forbidden — only super admins can add AMTPS members.');
  end if;
  if (auth.jwt() ->> 'aal') <> 'aal2' then
    return jsonb_build_object('error', 'MFA (two-factor) verification required to add AMTPS members.');
  end if;

  insert into public.amtps_members (
    full_name, email, student_id, department, year_of_study, position,
    domain, avatar_url, telegram, github, linkedin, contact_email
  ) values (
    coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_student_id, '')), ''),
    nullif(btrim(coalesce(p_department, '')), ''),
    nullif(btrim(coalesce(p_year_of_study, '')), ''),
    nullif(btrim(coalesce(p_position, '')), ''),
    nullif(btrim(coalesce(p_domain, '')), ''),
    nullif(btrim(coalesce(p_avatar_url, '')), ''),
    nullif(btrim(coalesce(p_telegram, '')), ''),
    nullif(btrim(coalesce(p_github, '')), ''),
    nullif(btrim(coalesce(p_linkedin, '')), ''),
    nullif(btrim(coalesce(p_contact_email, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id::text);
end;
$$;

grant execute on function public.admin_add_amtps_member(
  text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_update_amtps_member: super admin edits an existing display card.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_amtps_member(
  p_id uuid,
  p_full_name text default null,
  p_email text default null,
  p_student_id text default null,
  p_department text default null,
  p_year_of_study text default null,
  p_position text default null,
  p_domain text default null,
  p_avatar_url text default null,
  p_telegram text default null,
  p_github text default null,
  p_linkedin text default null,
  p_contact_email text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null then
    raise exception 'Not authenticated';
  end if;
  if not (public.is_super_admin(v_admin_id) or exists (select 1 from public.profiles where id = v_admin_id and status = 'active' and role = 'main_admin')) then
    return jsonb_build_object('error', 'Forbidden — only super admins can edit AMTPS members.');
  end if;
  if (auth.jwt() ->> 'aal') <> 'aal2' then
    return jsonb_build_object('error', 'MFA (two-factor) verification required to edit AMTPS members.');
  end if;

  update public.amtps_members set
    full_name = coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), ''),
    email = nullif(btrim(coalesce(p_email, '')), ''),
    student_id = nullif(btrim(coalesce(p_student_id, '')), ''),
    department = nullif(btrim(coalesce(p_department, '')), ''),
    year_of_study = nullif(btrim(coalesce(p_year_of_study, '')), ''),
    position = nullif(btrim(coalesce(p_position, '')), ''),
    domain = nullif(btrim(coalesce(p_domain, '')), ''),
    avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
    telegram = nullif(btrim(coalesce(p_telegram, '')), ''),
    github = nullif(btrim(coalesce(p_github, '')), ''),
    linkedin = nullif(btrim(coalesce(p_linkedin, '')), ''),
    contact_email = nullif(btrim(coalesce(p_contact_email, '')), ''),
    updated_at = now()
  where id = p_id;

  if not found then
    return jsonb_build_object('error', 'AMTPS member not found.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_update_amtps_member(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_delete_amtps_member: super admin deletes a card (also gone from /members).
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_amtps_member(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null then
    raise exception 'Not authenticated';
  end if;
  if not (public.is_super_admin(v_admin_id) or exists (select 1 from public.profiles where id = v_admin_id and status = 'active' and role = 'main_admin')) then
    return jsonb_build_object('error', 'Forbidden — only super admins can delete AMTPS members.');
  end if;
  if (auth.jwt() ->> 'aal') <> 'aal2' then
    return jsonb_build_object('error', 'MFA (two-factor) verification required to delete AMTPS members.');
  end if;

  delete from public.amtps_members where id = p_id;

  if not found then
    return jsonb_build_object('error', 'AMTPS member not found.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_delete_amtps_member(uuid) to authenticated;
