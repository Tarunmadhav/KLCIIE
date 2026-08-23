-- ============================================================================
-- KL CIIE Platform V2 — 0052: Faculty registration page (/register-faculty)
--
-- Seeds a registration_roles row so faculty can create their own account via
-- the invite-style page at /register/faculty (aliased as /register-faculty).
-- Like other role pages it requires the static registration key plus the
-- rotating one-time code from the CIIE admin. Created profiles get
-- role='faculty', status='active', and are auto-registered into all published
-- faculty events by the 0051 trigger.
-- ============================================================================

insert into public.registration_roles (role, slug, label, secret, signing_secret, enabled, requires_keys, fields)
values (
  'faculty',
  'faculty',
  'Faculty',
  'CIIE-2026-FACULTY',
  encode(public.gen_random_bytes(24), 'hex'),
  true,
  true,
  '[{"key":"phone","label":"Phone number","type":"text","required":true},
    {"key":"department","label":"Department / Branch","type":"text","required":true},
    {"key":"designation","label":"Designation","type":"text","required":false}]'::jsonb
)
on conflict (slug) do update
  set role = excluded.role,
      label = excluded.label,
      enabled = excluded.enabled,
      requires_keys = excluded.requires_keys,
      fields = excluded.fields;
