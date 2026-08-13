-- ============================================================================
-- KL CIIE Platform V2 — 0037: AMTPS member "About" bio
-- Adds an editable per-member About/bio field (entered by the super admin in
-- /admin/amtps). Also recreated admin_add/update_amtps_member to accept the
-- new p_about parameter.
-- ============================================================================

alter table public.amtps_members add column if not exists about text;

-- ---------------------------------------------------------------------------
-- admin_add_amtps_member (now with p_about)
-- ---------------------------------------------------------------------------
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
    domain, about, avatar_url, telegram, github, linkedin, contact_email
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
    nullif(btrim(coalesce(p_contact_email, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id::text);
end;
$$;

grant execute on function public.admin_add_amtps_member(
  text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_update_amtps_member (now with p_about)
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
  p_about text default null,
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
    about = nullif(btrim(coalesce(p_about, '')), ''),
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
  uuid, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
