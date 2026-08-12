-- ============================================================================
-- KL CIIE Platform V2 — 0001: core schema
-- Run against a fresh Supabase project (SQL Editor) in order: 0001..0005
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- PROFILES (one row per auth user)
-- role list covers all admin types from the requirements.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  ciie_id text unique,
  role text not null default 'member'
    check (role in (
      'member', 'super_admin', 'event_admin', 'member_admin',
      'content_admin', 'gallery_admin', 'reports_admin', 'attendance_coordinator',
      'mail_admin'
    )),
  department text,
  year_of_study text,
  academic_year text,
  team text,
  bio text,
  skills text[] not null default '{}',
  social_links jsonb not null default '{}'::jsonb,
  avatar_url text,
  phone text,
  status text not null default 'pending' check (status in ('pending', 'recruit', 'active', 'disabled')),
  interview_batch smallint check (interview_batch in (1, 2)),
  mfa_enabled boolean not null default false,
  mfa_setup_required boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MEMBER PRIVACY SETTINGS
-- ---------------------------------------------------------------------------
create table if not exists public.member_privacy_settings (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  show_on_leaderboard boolean not null default true,
  show_public_profile boolean not null default true,
  show_points boolean not null default true,
  show_events boolean not null default true,
  show_contact boolean not null default false,
  show_avatar boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- EVENTS
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  category text not null default 'Workshop',
  banner_url text,
  start_date date not null,
  start_time text,
  end_date date,
  end_time text,
  venue text,
  mode text not null default 'offline' check (mode in ('offline', 'online', 'hybrid')),
  registration_deadline timestamptz,
  seats integer not null default 100 check (seats > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'completed', 'cancelled')),
  registration_enabled boolean not null default true,
  show_team_public boolean not null default true,
  coordinator_note text,
  form_fields jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_events_status_date on public.events (status, start_date);

-- ---------------------------------------------------------------------------
-- EVENT ROLES (custom, admin defined — never hardcoded)
-- ---------------------------------------------------------------------------
create table if not exists public.event_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'other'
    check (category in ('coordinator', 'volunteer', 'speaker', 'organizer', 'support', 'other')),
  display_order integer not null default 0,
  is_active boolean not null default true,
  award_points boolean not null default false,
  default_points integer not null default 0 check (default_points >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- EVENT TEAM MEMBERS (source of truth for "events worked on")
-- unique(event_id, member_id, role_id) prevents accidental duplicate assignments
-- ---------------------------------------------------------------------------
create table if not exists public.event_team_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.event_roles(id) on delete cascade,
  is_public boolean not null default true,
  contact_visible boolean not null default false,
  hours_worked numeric not null default 0 check (hours_worked >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, member_id, role_id)
);
create index if not exists idx_team_event on public.event_team_members (event_id);
create index if not exists idx_team_member on public.event_team_members (member_id);

-- ---------------------------------------------------------------------------
-- POINT RULES (configurable — values are NEVER hardcoded in app code)
-- ---------------------------------------------------------------------------
create table if not exists public.point_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  activity_type text not null unique,
  points integer not null check (points > 0),
  is_automatic boolean not null default false,
  is_active boolean not null default true,
  category text,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MEMBER POINTS TRANSACTIONS — immutable ledger
-- Totals are derived from this table (never a single editable number).
-- ---------------------------------------------------------------------------
create table if not exists public.member_points_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  activity_type text not null,
  points integer not null check (points <> 0),
  description text,
  awarded_by uuid references public.profiles(id) on delete set null,
  is_automatic boolean not null default false,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

-- Prevent awarding the same automatic point twice for the same activity.
create unique index if not exists uq_points_auto_reference
  on public.member_points_transactions (member_id, reference_type, reference_id)
  where is_automatic and reference_type is not null and reference_id is not null;

create index if not exists idx_points_member on public.member_points_transactions (member_id, created_at desc);
create index if not exists idx_points_member_event on public.member_points_transactions (member_id, event_id);

-- ---------------------------------------------------------------------------
-- MEMBER ACHIEVEMENTS
-- ---------------------------------------------------------------------------
create table if not exists public.member_achievements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'Achievement',
  achieved_on date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_achievements_member on public.member_achievements (member_id);

-- ---------------------------------------------------------------------------
-- EVENT REGISTRATIONS (with dynamic form data + participant QR code)
-- ---------------------------------------------------------------------------
create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete set null,
  attendee_name text not null,
  email text,
  phone text,
  department text,
  year_of_study text,
  college text,
  registration_code text not null unique,
  form_data jsonb not null default '{}'::jsonb,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists idx_reg_event on public.event_registrations (event_id);
create index if not exists idx_reg_email on public.event_registrations (email);

-- ---------------------------------------------------------------------------
-- ATTENDANCE
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid references public.event_registrations(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete cascade,
  status text not null check (status in ('present', 'absent')),
  method text not null default 'qr' check (method in ('qr', 'member_qr', 'manual')),
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (registration_id),
  unique (event_id, member_id)
);
create index if not exists idx_attendance_event on public.attendance (event_id);

-- ---------------------------------------------------------------------------
-- CERTIFICATES
-- ---------------------------------------------------------------------------
create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  registration_id uuid references public.event_registrations(id) on delete set null,
  certificate_code text not null unique,
  title text,
  issued_by uuid references public.profiles(id) on delete set null,
  issued_at timestamptz not null default now(),
  unique (event_id, member_id)
);
create index if not exists idx_certs_member on public.certificates (member_id);

-- ---------------------------------------------------------------------------
-- GALLERY
-- ---------------------------------------------------------------------------
create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  title text,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_gallery_event on public.gallery_items (event_id);

-- ---------------------------------------------------------------------------
-- ANNOUNCEMENTS
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  event_id uuid references public.events(id) on delete cascade,
  audience text not null default 'all' check (audience in ('all', 'members', 'admins')),
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- ---------------------------------------------------------------------------
-- CMS POSTS
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  excerpt text,
  content text,
  cover_image text,
  published boolean not null default false,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ADMIN AUDIT LOGS
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.admin_audit_logs (created_at desc);
create index if not exists idx_audit_actor on public.admin_audit_logs (actor_id);
create index if not exists idx_audit_action on public.admin_audit_logs (action);

-- ---------------------------------------------------------------------------
-- ADMIN MFA RECOVERY CODES
-- Only hashes are stored (SHA-256 of high-entropy single-use codes).
-- ---------------------------------------------------------------------------
create table if not exists public.admin_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_ip text
);
create index if not exists idx_recovery_admin on public.admin_recovery_codes (admin_id);

-- ---------------------------------------------------------------------------
-- BRANDING SETTINGS (single row) — logo URLs live in Supabase Storage
-- ---------------------------------------------------------------------------
create table if not exists public.branding_settings (
  id integer primary key default 1 check (id = 1),
  ciie_logo_url text,
  dark_logo_url text,
  light_logo_url text,
  favicon_url text,
  certificate_logo_url text,
  qr_attendance_logo_url text,
  primary_color text not null default '#7c3aed',
  institution_name text not null default 'Koneru Lakshmaiah Education Foundation',
  ciie_name text not null default 'CIIE — Centre for Innovation, Incubation & Entrepreneurship',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.branding_settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- MEMBER QR CODES
-- ---------------------------------------------------------------------------
create table if not exists public.member_qr_codes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- VIEWS (security_invoker so caller RLS applies)
-- ---------------------------------------------------------------------------

-- Per-member aggregate stats used by dashboards / profiles.
create or replace view public.v_member_stats
with (security_invoker = on) as
select
  p.id as member_id,
  p.full_name,
  p.ciie_id,
  p.department,
  p.year_of_study,
  p.team,
  p.avatar_url,
  coalesce(pts.total_points, 0)::bigint as total_points,
  coalesce(att.events_attended, 0)::bigint as events_attended,
  coalesce(work.events_worked, 0)::bigint as events_worked,
  coalesce(vol.volunteer_activities, 0)::bigint as volunteer_activities,
  coalesce(ach.achievements, 0)::bigint as achievements,
  coalesce(cert.certificates, 0)::bigint as certificates
from public.profiles p
left join (
  select member_id, sum(points) as total_points
  from public.member_points_transactions
  group by member_id
) pts on pts.member_id = p.id
left join (
  select member_id, count(*)::bigint as events_attended
  from public.attendance
  where status = 'present' and member_id is not null
  group by member_id
) att on att.member_id = p.id
left join (
  select member_id, count(distinct event_id)::bigint as events_worked
  from public.event_team_members
  group by member_id
) work on work.member_id = p.id
left join (
  select et.member_id, count(*)::bigint as volunteer_activities
  from public.event_team_members et
  join public.event_roles r on r.id = et.role_id
  where r.category = 'volunteer'
  group by et.member_id
) vol on vol.member_id = p.id
left join (
  select member_id, count(*)::bigint as achievements
  from public.member_achievements
  group by member_id
) ach on ach.member_id = p.id
left join (
  select member_id, count(*)::bigint as certificates
  from public.certificates
  group by member_id
) cert on cert.member_id = p.id;

-- Per-event aggregate stats (admin reports).
create or replace view public.v_event_stats
with (security_invoker = on) as
select
  e.id as event_id,
  e.title,
  e.status,
  e.start_date,
  (select count(*) from public.event_registrations r where r.event_id = e.id) as registrations,
  (select count(*) from public.attendance a where a.event_id = e.id and a.status = 'present') as present,
  (select count(*) from public.attendance a where a.event_id = e.id and a.status = 'absent') as absent,
  (select count(*) from public.event_team_members t where t.event_id = e.id) as team_size,
  (select count(*) from public.certificates c where c.event_id = e.id) as certificates
from public.events e;
