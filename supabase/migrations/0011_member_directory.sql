-- ============================================================================
-- KL CIIE Platform V2 — 0011: member directory (curated by super admin)
-- * profiles.domain         : designation / domain (e.g. Web Development)
-- * profiles.is_listed_member: only people added by super admin appear in the
--   admin Members directory; regular signups stay hidden until added.
-- * avatars bucket          : public storage for profile photos.
-- * admin_create_member()   : super admin creates a person WITH a login
--   (auth user + identity + profile). The on_auth_user_created trigger makes
--   the base profile; this function then fills the directory fields.
-- =======a=====================================================================

alter table public.profiles add column if not exists domain text;
alter table public.profiles add column if not exists is_listed_member boolean not null default false;

create index if not exists idx_profiles_listed on public.profiles (is_listed_member);

-- Existing admins are directory members; plain member signups are not listed
-- until a super admin explicitly adds them.
update public.profiles set is_listed_member = true
where role <> 'member' and role <> 'user';

-- ---------------------------------------------------------------------------
-- STORAGE: avatars bucket (public read, owner writes, admins can write too)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists storage_avatars_read on storage.objects;
create policy storage_avatars_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists storage_avatars_write on storage.objects;
create policy storage_avatars_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.admin_aal2())
  );

drop policy if exists storage_avatars_update on storage.objects;
create policy storage_avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.admin_aal2()))
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.admin_aal2()));

drop policy if exists storage_avatars_delete on storage.objects;
create policy storage_avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = auth.uid()::text or public.admin_aal2()));

-- ---------------------------------------------------------------------------
-- bcrypt_hash(): pgcrypto lives in `public` locally but in `extensions` on
-- Supabase hosted. Resolve the schema at runtime so admin_create_member works
-- everywhere with a pinned search_path.
-- ---------------------------------------------------------------------------
create or replace function public.bcrypt_hash(p_text text)
returns text
language plpgsql stable
set search_path = ''
as $$
declare v text;
begin
  if to_regprocedure('extensions.crypt(text, text)') is not null then
    select extensions.crypt(p_text, extensions.gen_salt('bf')) into v;
  else
    select public.crypt(p_text, public.gen_salt('bf')) into v;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_create_member(p_full_name, p_email, p_password, ...)
-- Creates a real login + profile and lists the person in the Members directory.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_member(
  p_full_name text,
  p_email text,
  p_password text,
  p_role text default 'member',
  p_phone text default null,
  p_department text default null,
  p_year_of_study text default null,
  p_team text default null,
  p_domain text default null,
  p_avatar_url text default null,
  p_telegram text default null,
  p_github text default null,
  p_linkedin text default null,
  p_contact_email text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_user_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
  v_role text := nullif(trim(p_role), '');
  v_social jsonb;
begin
  if v_admin_id is null then
    raise exception 'Not authenticated';
  end if;
  if not (public.is_super_admin(v_admin_id) or exists (select 1 from public.profiles where id = v_admin_id and status = 'active' and role = 'main_admin')) then
    return jsonb_build_object('error', 'Forbidden — only super admins can add members.');
  end if;
  if (auth.jwt() ->> 'aal') <> 'aal2' then
    return jsonb_build_object('error', 'MFA (two-factor) verification required to add members.');
  end if;
  if v_email = '' or p_full_name is null or trim(p_full_name) = '' then
    return jsonb_build_object('error', 'Name and email are required.');
  end if;
  if length(coalesce(p_password, '')) < 6 then
    return jsonb_build_object('error', 'Password must be at least 6 characters.');
  end if;
  if v_role is null or v_role not in (
    'member', 'member_ciie', 'super_admin', 'main_admin', 'event_admin', 'member_admin', 'content_admin',
    'gallery_admin', 'reports_admin', 'attendance_coordinator', 'mail_admin'
  ) then
    v_role := 'member';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    return jsonb_build_object('error', 'A user with this email already exists.');
  end if;

  begin
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', v_email,
      public.bcrypt_hash(p_password),
      now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object(
        'full_name', trim(p_full_name),
        'role', v_role,
        'phone', coalesce(p_phone, ''),
        'department', coalesce(p_department, ''),
        'year_of_study', coalesce(p_year_of_study, '')
      ),
      now(), now()
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    )
    values (
      v_user_id, v_user_id, v_user_id, 'email',
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      now(), now(), now()
    );

    v_social := jsonb_strip_nulls(jsonb_build_object(
      'telegram', nullif(p_telegram, ''),
      'github', nullif(p_github, ''),
      'linkedin', nullif(p_linkedin, ''),
      'email', nullif(p_contact_email, '')
    ));

    update public.profiles set
      phone = nullif(p_phone, ''),
      department = nullif(p_department, ''),
      year_of_study = nullif(p_year_of_study, ''),
      team = nullif(p_team, ''),
      domain = nullif(p_domain, ''),
      avatar_url = nullif(p_avatar_url, ''),
      social_links = v_social,
      is_listed_member = true,
      status = 'active'
    where id = v_user_id;

    return jsonb_build_object(
      'ok', true,
      'user_id', v_user_id::text,
      'ciie_id', (select ciie_id from public.profiles where id = v_user_id)
    );
  exception when others then
    return jsonb_build_object('error', SQLERRM);
  end;
end;
$$;

grant execute on function public.admin_create_member(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
