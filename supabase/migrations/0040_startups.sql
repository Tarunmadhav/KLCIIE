-- ============================================================================
-- KL CIIE Platform V2 — 0040: Startups showcase
--
-- Startups are public cards showing ventures launched through CIIE. Super admins
-- and mail admins can add/edit/delete them. They appear on the public
-- /startups page and in the "Our Startups" navbar link.
-- ============================================================================

create table if not exists public.startups (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  website_url text,
  logo_url text,
  banner_url text,
  contact_email text,
  location text,
  social_links jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.startups enable row level security;

-- Public read: the /startups page renders these cards.
drop policy if exists startups_public_read on public.startups;
create policy startups_public_read on public.startups
  for select to anon, authenticated
  using (true);

-- No direct insert/update/delete policies: writes go through security
-- definer RPCs below (super admin / mail admin + MFA only).

-- ---------------------------------------------------------------------------
-- admin_add_startup: super admin or mail admin creates a startup card.
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_startup(
  p_name text default '',
  p_website_url text default null,
  p_logo_url text default null,
  p_banner_url text default null,
  p_contact_email text default null,
  p_location text default null,
  p_social_links jsonb default '{}'::jsonb,
  p_display_order integer default 0
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
  if not (
    public.is_super_admin(v_admin_id)
    or exists (select 1 from public.profiles where id = v_admin_id and status = 'active' and role = 'main_admin')
    or public.is_mail_admin(v_admin_id)
  ) then
    return jsonb_build_object('error', 'Forbidden — only super admins and mail admins can add startups.');
  end if;
  if (auth.jwt() ->> 'aal') <> 'aal2' then
    return jsonb_build_object('error', 'MFA (two-factor) verification required to add startups.');
  end if;

  insert into public.startups (
    name, website_url, logo_url, banner_url, contact_email,
    location, social_links, display_order
  ) values (
    coalesce(nullif(btrim(coalesce(p_name, '')), ''), ''),
    nullif(btrim(coalesce(p_website_url, '')), ''),
    nullif(btrim(coalesce(p_logo_url, '')), ''),
    nullif(btrim(coalesce(p_banner_url, '')), ''),
    nullif(btrim(coalesce(p_contact_email, '')), ''),
    nullif(btrim(coalesce(p_location, '')), ''),
    coalesce(p_social_links, '{}'::jsonb),
    coalesce(p_display_order, 0)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id::text);
end;
$$;

grant execute on function public.admin_add_startup(
  text, text, text, text, text, text, jsonb, integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_update_startup: super admin or mail admin edits an existing startup.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_startup(
  p_id uuid,
  p_name text default '',
  p_website_url text default null,
  p_logo_url text default null,
  p_banner_url text default null,
  p_contact_email text default null,
  p_location text default null,
  p_social_links jsonb default '{}'::jsonb,
  p_display_order integer default 0
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    public.is_super_admin(v_admin_id)
    or exists (select 1 from public.profiles where id = v_admin_id and status = 'active' and role = 'main_admin')
    or public.is_mail_admin(v_admin_id)
  ) then
    return jsonb_build_object('error', 'Forbidden — only super admins and mail admins can edit startups.');
  end if;
  if (auth.jwt() ->> 'aal') <> 'aal2' then
    return jsonb_build_object('error', 'MFA (two-factor) verification required to edit startups.');
  end if;

  update public.startups set
    name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), ''),
    website_url = nullif(btrim(coalesce(p_website_url, '')), ''),
    logo_url = nullif(btrim(coalesce(p_logo_url, '')), ''),
    banner_url = nullif(btrim(coalesce(p_banner_url, '')), ''),
    contact_email = nullif(btrim(coalesce(p_contact_email, '')), ''),
    location = nullif(btrim(coalesce(p_location, '')), ''),
    social_links = coalesce(p_social_links, '{}'::jsonb),
    display_order = coalesce(p_display_order, 0),
    updated_at = now()
  where id = p_id;

  if not found then
    return jsonb_build_object('error', 'Startup not found.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_update_startup(
  uuid, text, text, text, text, text, text, jsonb, integer
) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_delete_startup: super admin or mail admin deletes a startup card.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_startup(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if v_admin_id is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    public.is_super_admin(v_admin_id)
    or exists (select 1 from public.profiles where id = v_admin_id and status = 'active' and role = 'main_admin')
    or public.is_mail_admin(v_admin_id)
  ) then
    return jsonb_build_object('error', 'Forbidden — only super admins and mail admins can delete startups.');
  end if;
  if (auth.jwt() ->> 'aal') <> 'aal2' then
    return jsonb_build_object('error', 'MFA (two-factor) verification required to delete startups.');
  end if;

  delete from public.startups where id = p_id;

  if not found then
    return jsonb_build_object('error', 'Startup not found.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_delete_startup(uuid) to authenticated;
