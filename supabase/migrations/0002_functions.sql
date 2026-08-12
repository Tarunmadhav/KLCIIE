-- ============================================================================
-- KL CIIE Platform V2 — 0002: functions
-- All security definer functions pin search_path and use fully-qualified names.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ROLE HELPERS
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.status = 'active'
      and p.role in (
        'super_admin', 'event_admin', 'member_admin', 'content_admin',
        'gallery_admin', 'reports_admin', 'attendance_coordinator', 'mail_admin'
      )
  );
$$;

create or replace function public.is_super_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.status = 'active' and p.role = 'super_admin'
  );
$$;

-- True only when the caller is an admin AND, if they are a super admin,
-- they have completed MFA (aal2 claim). Non-super admin roles do not need MFA.
create or replace function public.admin_aal2()
returns boolean
language sql stable set search_path = ''
as $$
  select public.is_admin()
     and (not public.is_super_admin() or (auth.jwt() ->> 'aal') = 'aal2');
$$;

-- ---------------------------------------------------------------------------
-- CIIE ID generation: CIIE<year><5-digit seq>, e.g. CIIE202600045
-- ---------------------------------------------------------------------------
create or replace function public.next_ciie_id()
returns text
language sql stable set search_path = ''
as $$
  select 'CIIE' || to_char(extract(year from now())::int, 'FM0000')
       || lpad((coalesce(max(substring(ciie_id from 9)::int), 0) + 1)::text, 5, '0')
  from public.profiles
  where ciie_id like 'CIIE' || to_char(extract(year from now())::int, 'FM0000') || '%';
$$;

-- ---------------------------------------------------------------------------
-- GENERIC: touch updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- MANUAL POINT AWARD (authorized admins only, writes ledger + audit log)
-- ---------------------------------------------------------------------------
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
  if not public.is_admin() then
    raise exception 'Not authorized';
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

-- ---------------------------------------------------------------------------
-- RECOVERY CODES (Supabase Auth does not provide them natively)
-- Codes are random high-entropy strings; only SHA-256 hashes are stored.
-- ---------------------------------------------------------------------------
create or replace function public.generate_recovery_codes(p_codes text[])
returns table(code text)
language plpgsql security definer set search_path = ''
as $$
declare
  c text;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  foreach c in array p_codes loop
    insert into public.admin_recovery_codes (admin_id, code_hash)
    values (auth.uid(), encode(sha256(trim(c)::bytea), 'hex'))
    on conflict (code_hash) do nothing;
    return query select c;
  end loop;
end;
$$;

create or replace function public.use_recovery_code(p_code text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_hash text;
  v_row public.admin_recovery_codes%rowtype;
begin
  if not public.is_admin() then
    return false;
  end if;
  v_hash := encode(sha256(trim(p_code)::bytea), 'hex');
  select * into v_row
  from public.admin_recovery_codes
  where admin_id = auth.uid() and code_hash = v_hash and used_at is null
  for update;
  if not found then
    return false;
  end if;
  update public.admin_recovery_codes
  set used_at = now(), used_ip = nullif(current_setting('request.headers', true), '')
  where id = v_row.id;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'Recovery Code Used', 'admin', auth.uid()::text,
          jsonb_build_object('recovery_code_id', v_row.id));
  return true;
end;
$$;

-- Super Admin: force an admin to reconfigure MFA (clears flags + recovery codes).
create or replace function public.reset_admin_mfa(p_admin_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;
  update public.profiles
  set mfa_enabled = false, mfa_setup_required = true
  where id = p_admin_id and role not in ('member', 'user');
  delete from public.admin_recovery_codes where admin_id = p_admin_id;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'MFA Reset', 'admin', p_admin_id::text,
          jsonb_build_object('forced', true));
end;
$$;

-- ---------------------------------------------------------------------------
-- MARK ATTENDANCE (called by the attendance scanner)
-- QR payload contains either a registration_code or a member QR code.
-- The attendance trigger awards points automatically.
-- ---------------------------------------------------------------------------
create or replace function public.mark_attendance(
  p_event_id uuid,
  p_registration_code text default null,
  p_member_code text default null,
  p_method text default 'qr'
)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  v_att public.attendance%rowtype;
  v_reg_id uuid;
  v_member_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if p_registration_code is not null then
    select id, member_id into v_reg_id, v_member_id
    from public.event_registrations
    where registration_code = p_registration_code and event_id = p_event_id and status <> 'cancelled';
    if not found then
      raise exception 'Invalid registration code for this event';
    end if;
  elsif p_member_code is not null then
    select mq.id, mq.member_id into v_member_id, v_member_id
    from public.member_qr_codes mq
    where mq.code = p_member_code;
    if not found then
      raise exception 'Invalid member code';
    end if;
    -- Member QR may map to an existing registration for the event.
    select id into v_reg_id
    from public.event_registrations
    where event_id = p_event_id and member_id = v_member_id and status <> 'cancelled'
    order by created_at desc limit 1;
  else
    raise exception 'Missing code';
  end if;

  if v_member_id is null then
    raise exception 'No CIIE member linked to this registration';
  end if;

  insert into public.attendance (event_id, registration_id, member_id, status, method, marked_by)
  values (p_event_id, v_reg_id, v_member_id, 'present', p_method, auth.uid())
  on conflict (registration_id)
  do update set status = 'present', method = excluded.method, marked_by = excluded.marked_by, marked_at = now()
  returning * into v_att;

  return v_att;
end;
$$;

-- Manual attendance mark (also used to correct present -> absent).
create or replace function public.set_attendance(
  p_attendance_id uuid,
  p_status text
)
returns public.attendance
language plpgsql security definer set search_path = ''
as $$
declare
  v_att public.attendance%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_status not in ('present', 'absent') then
    raise exception 'Invalid status';
  end if;
  update public.attendance set status = p_status, marked_by = auth.uid(), marked_at = now()
  where id = p_attendance_id
  returning * into v_att;
  return v_att;
end;
$$;

-- ---------------------------------------------------------------------------
-- LEADERBOARD
-- Public safe: only returns members who opted in via privacy settings.
-- ---------------------------------------------------------------------------
create or replace function public.get_leaderboard(
  p_academic_year text default null,
  p_department text default null,
  p_year text default null,
  p_team text default null,
  p_period text default 'all'
)
returns table (
  rank bigint,
  member_id uuid,
  full_name text,
  ciie_id text,
  department text,
  year_of_study text,
  team text,
  avatar_url text,
  total_points bigint,
  events_attended bigint,
  events_worked bigint
)
language sql stable security definer set search_path = ''
as $$
  with period_start as (
    select case
      when extract(month from now()) >= 8 then make_date(extract(year from now())::int, 8, 1)
      else make_date((extract(year from now())::int - 1), 8, 1)
    end as s
  ),
  agg as (
    select t.member_id,
           sum(t.points)::bigint as total_points,
           count(distinct t.event_id)::bigint as events_worked
    from public.member_points_transactions t
    cross join period_start ps
    where (p_period = 'all' or t.created_at >= ps.s)
    group by t.member_id
  ),
  att as (
    select a.member_id, count(*)::bigint as events_attended
    from public.attendance a
    where a.status = 'present' and a.member_id is not null
    group by a.member_id
  )
  select
    row_number() over (order by agg.total_points desc, p.created_at asc)::bigint as rank,
    p.id as member_id,
    p.full_name,
    p.ciie_id,
    p.department,
    p.year_of_study,
    p.team,
    p.avatar_url,
    agg.total_points,
    coalesce(att.events_attended, 0) as events_attended,
    agg.events_worked
  from public.profiles p
  join agg on agg.member_id = p.id
  left join att on att.member_id = p.id
  join public.member_privacy_settings pr on pr.member_id = p.id
  where p.status = 'active'
    and pr.show_on_leaderboard
    and (p_academic_year is null or p.academic_year = p_academic_year)
    and (p_department is null or p.department = p_department)
    and (p_year is null or p.year_of_study = p_year)
    and (p_team is null or p.team = p_team)
  order by agg.total_points desc, p.created_at asc;
$$;

-- Member's own rank (respects privacy for public visibility).
create or replace function public.get_member_rank(p_member_id uuid)
returns bigint
language sql stable set search_path = ''
as $$
  select rank from public.get_leaderboard() where member_id = p_member_id limit 1;
$$;

-- ---------------------------------------------------------------------------
-- PUBLIC MEMBER PROFILE
-- Returns a privacy-aware JSON payload for the public member page.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_member(p_member_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
  v_priv public.member_privacy_settings%rowtype;
  v_profile public.profiles%rowtype;
  v_viewer_is_admin boolean := public.is_admin();
  v_viewer_is_self boolean := (p_member_id = auth.uid());
begin
  select * into v_profile from public.profiles where id = p_member_id;
  if not found then
    return null;
  end if;
  select * into v_priv from public.member_privacy_settings where member_id = p_member_id;
  if v_priv is null then
    v_priv.member_id := p_member_id;
    v_priv.show_public_profile := true;
    v_priv.show_points := true;
    v_priv.show_events := true;
    v_priv.show_contact := false;
    v_priv.show_avatar := true;
  end if;

  if not v_viewer_is_admin and not v_viewer_is_self and not v_priv.show_public_profile then
    return null;
  end if;

  v := jsonb_build_object(
    'id', v_profile.id,
    'full_name', v_profile.full_name,
    'ciie_id', v_profile.ciie_id,
    'role', v_profile.role,
    'department', v_profile.department,
    'year_of_study', v_profile.year_of_study,
    'academic_year', v_profile.academic_year,
    'team', v_profile.team,
    'domain', v_profile.domain,
    'bio', v_profile.bio,
    'skills', v_profile.skills,
    'avatar_url', case when v_priv.show_avatar or v_viewer_is_admin then v_profile.avatar_url else null end,
    'social_links', v_profile.social_links,
    'phone', case when v_priv.show_contact or v_viewer_is_admin then v_profile.phone else null end,
    'total_points', case when v_priv.show_points or v_viewer_is_admin then
      coalesce((select sum(t.points) from public.member_points_transactions t where t.member_id = v_profile.id), 0) else null end,
    'events_attended', (select count(*) from public.attendance a where a.member_id = v_profile.id and a.status = 'present'),
    'events_worked', (select count(distinct et.event_id) from public.event_team_members et where et.member_id = v_profile.id),
    'volunteer_activities', (select count(*) from public.event_team_members et
                              join public.event_roles r on r.id = et.role_id
                              where et.member_id = v_profile.id and r.category = 'volunteer'),
    'achievements', (select jsonb_agg(jsonb_build_object('title', a.title, 'description', a.description,
                                                         'category', a.category, 'date', a.achieved_on)
                                      order by a.achieved_on desc nulls last)
                     from public.member_achievements a where a.member_id = v_profile.id),
    'certificates', (select jsonb_agg(jsonb_build_object('title', c.title, 'event_id', c.event_id,
                                                         'code', c.certificate_code, 'issued_at', c.issued_at)
                                      order by c.issued_at desc)
                     from public.certificates c where c.member_id = v_profile.id)
  );
  return v;
end;
$$;

-- Public "events worked on" for a member profile (auto-derived from event_team_members).
create or replace function public.get_member_events_worked(p_member_id uuid)
returns table (event_id uuid, title text, role_name text, role_category text, start_date date, slug text, is_public boolean)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.title, r.name, r.category, e.start_date, e.slug, et.is_public
  from public.event_team_members et
  join public.events e on e.id = et.event_id
  join public.event_roles r on r.id = et.role_id
  where et.member_id = p_member_id
    and e.status in ('published', 'completed')
    and (et.is_public or public.is_admin() or p_member_id = auth.uid())
  order by e.start_date desc;
$$;

-- ---------------------------------------------------------------------------
-- REGISTRATION CODE generation
-- ---------------------------------------------------------------------------
create or replace function public.next_registration_code()
returns text
language sql stable set search_path = ''
as $$
  select 'REG-' || to_char(extract(year from now())::int, 'FM0000')
       || '-' || lpad((coalesce(max(substring(registration_code from 10)::int), 0) + 1)::text, 6, '0')
  from public.event_registrations
  where registration_code like 'REG-' || to_char(extract(year from now())::int, 'FM0000') || '-%';
$$;

-- ---------------------------------------------------------------------------
-- CERTIFICATE CODE generation
-- ---------------------------------------------------------------------------
create or replace function public.next_certificate_code()
returns text
language sql stable set search_path = ''
as $$
  select 'CERT-' || to_char(extract(year from now())::int, 'FM0000')
       || '-' || lpad((coalesce(max(substring(certificate_code from 11)::int), 0) + 1)::text, 6, '0')
  from public.certificates
  where certificate_code like 'CERT-' || to_char(extract(year from now())::int, 'FM0000') || '-%';
$$;

-- Register helper for a confirmed registration (returns row with code).
create or replace function public.create_registration(
  p_event_id uuid,
  p_attendee_name text,
  p_email text,
  p_phone text default null,
  p_department text default null,
  p_year_of_study text default null,
  p_college text default null,
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
    (event_id, member_id, attendee_name, email, phone, department, year_of_study, college, registration_code, form_data)
  values
    (p_event_id, v_member, p_attendee_name, coalesce(p_email, auth.jwt() ->> 'email'),
     p_phone, p_department, p_year_of_study, p_college, public.next_registration_code(),
     coalesce(p_form_data, '{}'::jsonb))
  returning * into v_reg;
  return v_reg;
end;
$$;
