-- ============================================================================
-- KL CIIE Platform V2 — 0005: seed data
-- Point rules and event roles are SEEDED but fully editable via the admin UI
-- (nothing in the app code is hardcoded).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- POINT RULES (matches the requested defaults; admins can edit/disable/delete)
-- ---------------------------------------------------------------------------
insert into public.point_rules (name, activity_type, points, is_automatic, is_active, category, description) values
  ('Attend CIIE Event',              'attendance',            10, true,  true, 'Participation', 'Awarded automatically when QR attendance is marked present.'),
  ('Volunteer for Event',            'volunteer',             20, true,  true, 'Event Work',     'Awarded automatically when assigned a Volunteer role.'),
  ('Organize Event',                 'organizer',             30, true,  true, 'Event Work',     'Awarded automatically when assigned an Organizer role.'),
  ('Event Coordinator',              'event_coordinator',     30, true,  true, 'Event Work',     'Awarded automatically when assigned a Coordinator role.'),
  ('Workshop Speaker',               'workshop_speaker',      40, true,  true, 'Event Work',     'Awarded automatically when assigned a Speaker role.'),
  ('Competition Winner',             'competition_winner',    50, false, true, 'Achievement',    'Awarded manually by admin.'),
  ('Competition Runner-up',          'competition_runner_up', 30, false, true, 'Achievement',    'Awarded manually by admin.'),
  ('Complete CIIE Activity',         'activity_completion',   15, false, true, 'Achievement',    'Awarded manually by admin.'),
  ('Special Achievement',            'special_achievement',   50, false, true, 'Achievement',    'Awarded manually by admin.')
on conflict (activity_type) do nothing;

-- ---------------------------------------------------------------------------
-- EVENT ROLES (custom roles — admins can create more)
-- ---------------------------------------------------------------------------
insert into public.event_roles (name, description, category, display_order, is_active, award_points, default_points) values
  ('Event Coordinator',          'Owns end-to-end event delivery.',      'coordinator', 1,  true,  true, 30),
  ('Event Lead',                 'Leads the overall event team.',        'coordinator', 2,  true,  true, 30),
  ('Technical Coordinator',      'Manages technical setup and support.', 'coordinator', 3,  true,  true, 20),
  ('Registration Coordinator',   'Handles registrations and check-in.',  'coordinator', 4,  true,  true, 20),
  ('Marketing Coordinator',      'Leads promotion and outreach.',        'coordinator', 5,  true,  true, 20),
  ('Hospitality Coordinator',    'Manages guest hospitality.',           'coordinator', 6,  true,  true, 20),
  ('Photography Coordinator',    'Coordinates photography coverage.',    'coordinator', 7,  true,  true, 20),
  ('Social Media Coordinator',   'Handles social media coverage.',       'coordinator', 8,  true,  true, 20),
  ('Stage Coordinator',          'Manages stage and program flow.',      'coordinator', 9,  true,  true, 20),
  ('Design Coordinator',         'Leads banners and design assets.',     'coordinator', 10, true,  true, 20),
  ('Documentation Coordinator',  'Manages documentation and minutes.',   'coordinator', 11, true,  true, 20),
  ('Technical Support',          'Provides on-site tech support.',       'support',     12, true,  true, 15),
  ('Guest Management',           'Handles guest relations.',             'support',     13, true,  true, 15),
  ('Volunteer',                  'General event volunteering.',          'volunteer',   14, true,  true, 20),
  ('Workshop Speaker',           'Delivers workshop sessions.',          'speaker',     15, true,  true, 40)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- DEFAULT BRANDING row (logo URLs filled in via the admin Branding page)
-- ---------------------------------------------------------------------------
insert into public.branding_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- FIRST SUPER ADMIN
-- After registering your admin account (or any account), promote it here:
--   update public.profiles
--   set role = 'super_admin', status = 'active', mfa_setup_required = true
--   where email = 'admin@klu.ac.in';
-- New signups are 'pending' by default, so status must be set to 'active'.
-- The next login will force MFA setup before the Admin Dashboard is reachable.
-- ---------------------------------------------------------------------------

-- Optional starter events so the site is not empty:
insert into public.events
  (title, slug, description, category, start_date, start_time, end_date, end_time, venue, mode, seats, status, registration_enabled, registration_deadline)
values
  ('AI Workshop 2026', 'ai-workshop-2026',
   'Hands-on introduction to modern AI and machine learning workflows.',
   'Workshop', '2026-08-20', '10:00', '2026-08-20', '16:00',
   'CIIE Innovation Hub', 'offline', 120, 'published', true, '2026-08-19 18:00:00+00'),
  ('Hackathon 2026', 'hackathon-2026',
   '48-hour build sprint — form teams and ship an innovation.',
   'Hackathon', '2026-08-25', '09:00', '2026-08-27', '09:00',
   'CIIE Main Hall', 'hybrid', 200, 'published', true, '2026-08-24 18:00:00+00'),
  ('Entrepreneurship Summit', 'entrepreneurship-summit',
   'Founders, mentors and investors share the stage.',
   'Summit', '2026-08-29', '10:00', '2026-08-29', '18:00',
   'KLU Convention Centre', 'offline', 300, 'published', true, '2026-08-28 18:00:00+00')
on conflict (slug) do nothing;

insert into public.posts (title, slug, excerpt, content, published)
values (
  'Welcome to the CIIE Platform V2',
  'welcome-to-ciie-platform-v2',
  'CIIE points, leaderboards, event teams and MFA-protected admin tools.',
  'The KL CIIE Platform now rewards active participation with CIIE Points, public leaderboards, event team assignments and a fully MFA-protected admin console.',
  true
) on conflict (slug) do nothing;
