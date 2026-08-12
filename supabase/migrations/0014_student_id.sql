-- ============================================================================
-- KL CIIE Platform — 0014: Student ID
-- Adds a university/college "Student ID" (roll number) captured on the
-- public event registration, signup and role-registration forms.
-- * profiles.student_id          : stored from signup / role registration meta
-- * event_registrations.student_id : stored from the event registration form
-- ============================================================================

alter table public.profiles
  add column if not exists student_id text;

alter table public.event_registrations
  add column if not exists student_id text;

create index if not exists idx_profiles_student_id on public.profiles (student_id);
create index if not exists idx_reg_student_id on public.event_registrations (student_id);

-- ---------------------------------------------------------------------------
-- CREATE REGISTRATION — accept and store the student ID
-- ---------------------------------------------------------------------------
create or replace function public.create_registration(
  p_event_id uuid,
  p_attendee_name text,
  p_email text,
  p_phone text default null,
  p_department text default null,
  p_year_of_study text default null,
  p_college text default null,
  p_student_id text default null,
  p_form_data jsonb default '{}'::jsonb
)
returns public.event_registrations
language plpgsql security definer set search_path = ''
as $$
declare
  v_reg public.event_registrations;
  v_member uuid := auth.uid();
  v_event public.events%rowtype;
begin
  select * into v_event from public.events where id = p_event_id and status = 'published' and registration_enabled;
  if not found then
    raise exception 'Event not open for registration';
  end if;
  if v_event.registration_deadline is not null and v_event.registration_deadline < now() then
    raise exception 'Registration deadline passed';
  end if;
  if (select count(*) from public.event_registrations where event_id = p_event_id and status <> 'cancelled') >= v_event.seats then
    raise exception 'Event is full';
  end if;

  insert into public.event_registrations
    (event_id, member_id, attendee_name, student_id, email, phone, department, year_of_study, college, registration_code, form_data)
  values
    (p_event_id, v_member, p_attendee_name, nullif(p_student_id, ''), coalesce(p_email, auth.jwt() ->> 'email'),
     p_phone, p_department, p_year_of_study, p_college, public.next_registration_code(),
     coalesce(p_form_data, '{}'::jsonb))
  returning * into v_reg;
  return v_reg;
end;
$$;

-- ---------------------------------------------------------------------------
-- HANDLE NEW USER — keep student_id out of custom_fields, store on the column
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_meta jsonb := new.raw_user_meta_data;
  v_role text := coalesce(v_meta ->> 'role', 'member');
  v_name text := coalesce(v_meta ->> 'full_name', split_part(new.email, '@', 1));
  v_slug text := v_meta ->> 'role_slug';
  v_token text := v_meta ->> 'registration_token';
  v_status text := 'pending';
  v_batch smallint;
  v_pending bigint;
  v_mfa boolean := false;
  v_reg_row public.registration_roles%rowtype;
  v_custom jsonb;
begin
  if v_slug is not null and v_token is not null then
    select * into v_reg_row from public.registration_roles where slug = v_slug and role = v_role and enabled;
    if found and public.verify_registration_token(v_slug, new.email, v_token, v_reg_row.signing_secret) then
      v_status := 'active';
      if v_role in ('super_admin','main_admin','event_admin','member_admin','content_admin',
                   'gallery_admin','reports_admin','attendance_coordinator','mail_admin') then
        v_mfa := true;
      end if;
    else
      v_role := 'member';
      v_slug := null;
    end if;
  end if;

  if v_slug is null then
    v_role := 'member';
    v_status := 'pending';
    select count(*) into v_pending from public.profiles where status = 'pending';
    v_batch := case when v_pending % 2 = 0 then 1 else 2 end;
  end if;

  select jsonb_object_agg(k, val)
  into v_custom
  from jsonb_each_text(v_meta) as t(k, val)
  where k not in ('role','role_slug','registration_token','full_name','phone','department','year_of_study','student_id');

  insert into public.profiles (
    id, email, full_name, role, ciie_id, mfa_setup_required,
    status, interview_batch, phone, department, year_of_study, student_id, custom_fields
  )
  values (
    new.id, new.email, v_name, v_role, public.next_ciie_id(),
    v_mfa,
    v_status, v_batch,
    v_meta ->> 'phone',
    v_meta ->> 'department',
    v_meta ->> 'year_of_study',
    nullif(v_meta ->> 'student_id', ''),
    coalesce(v_custom, '{}'::jsonb)
  )
  on conflict (id) do nothing;

  insert into public.member_privacy_settings (member_id) values (new.id) on conflict do nothing;
  insert into public.member_qr_codes (member_id, code)
  values (new.id, encode(public.gen_random_bytes(9), 'hex'))
  on conflict (member_id) do nothing;

  if v_role not in ('member', 'user') then
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
    values (new.id, 'Admin Account Created', 'admin', new.id::text, jsonb_build_object('role', v_role));
  end if;

  return new;
end;
$$;
