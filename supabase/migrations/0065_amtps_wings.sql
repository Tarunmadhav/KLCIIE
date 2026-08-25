-- ============================================================================
-- KL CIIE Platform V2 — 0065: AMTPS Wings
--
-- Adds "wings" (sub-groups) to the AMTPS team showcase.  A super admin
-- defines wings in Settings (name + display order).  When adding/editing
-- AMTPS members the admin assigns a wing.  The public /amtps page groups
-- members by wing in the configured order.
-- ============================================================================

-- 1. Store wing definitions in the singleton platform_settings row.
--    Format: [{ "id": "abc", "name": "Web Dev", "display_order": 0 }, …]
alter table public.platform_settings
  add column if not exists amtps_wings jsonb not null default '[]'::jsonb;

-- 2. Assign each AMTPS member to a wing (stores the wing id).
alter table public.amtps_members
  add column if not exists wing text;

-- 3. Replace admin_add_amtps_member to accept p_wing.
create or replace function public.admin_add_amtps_member(
  p_full_name text default null,
  p_email text default null,
  p_student_id text default null,
  p_department text default null,
  p_year_of_study text default null,
  p_position text default null,
  p_domain text default null,
  p_about text default null,
  p_avatar_url text default null,
  p_telegram text default null,
  p_github text default null,
  p_linkedin text default null,
  p_contact_email text default null,
  p_wing text default null
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
    domain, about, avatar_url, telegram, github, linkedin, contact_email, wing
  ) values (
    coalesce(nullif(btrim(coalesce(p_full_name, '')), ''), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_student_id, '')), ''),
    nullif(btrim(coalesce(p_department, '')), ''),
    nullif(btrim(coalesce(p_year_of_study, '')), ''),
    nullif(btrim(coalesce(p_position, '')), ''),
    nullif(btrim(coalesce(p_domain, '')), ''),
    nullif(btrim(coalesce(p_about, '')), ''),
    nullif(btrim(coalesce(p_avatar_url, '')), ''),
    nullif(btrim(coalesce(p_telegram, '')), ''),
    nullif(btrim(coalesce(p_github, '')), ''),
    nullif(btrim(coalesce(p_linkedin, '')), ''),
    nullif(btrim(coalesce(p_contact_email, '')), ''),
    nullif(btrim(coalesce(p_wing, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id::text);
end;
$$;

grant execute on function public.admin_add_amtps_member(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- 4. Replace admin_update_amtps_member to accept p_wing.
create or replace function public.admin_update_amtps_member(
  p_id uuid,
  p_full_name text default null,
  p_email text default null,
  p_student_id text default null,
  p_department text default null,
  p_year_of_study text default null,
  p_position text default null,
  p_domain text default null,
  p_about text default null,
  p_avatar_url text default null,
  p_telegram text default null,
  p_github text default null,
  p_linkedin text default null,
  p_contact_email text default null,
  p_wing text default null
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
    about = nullif(btrim(coalesce(p_about, '')), ''),
    avatar_url = nullif(btrim(coalesce(p_avatar_url, '')), ''),
    telegram = nullif(btrim(coalesce(p_telegram, '')), ''),
    github = nullif(btrim(coalesce(p_github, '')), ''),
    linkedin = nullif(btrim(coalesce(p_linkedin, '')), ''),
    contact_email = nullif(btrim(coalesce(p_contact_email, '')), ''),
    wing = nullif(btrim(coalesce(p_wing, '')), ''),
    updated_at = now()
  where id = p_id;

  if not found then
    return jsonb_build_object('error', 'AMTPS member not found.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_update_amtps_member(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
