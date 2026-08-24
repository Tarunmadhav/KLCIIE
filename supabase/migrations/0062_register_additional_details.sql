-- 0062: Global "Additional details" form fields for account registration pages.
-- Admin-defined extra fields (label/type/options) appended to the Additional
-- details section of every registration page (/register, /register/:slug incl.
-- /register/user and /register-faculty). NOT used by Join CIIE (/signup), which
-- has its own signup_fields section. Answers land in profiles.custom_fields.

alter table public.platform_settings
  add column if not exists register_fields jsonb not null default '[]'::jsonb;

alter table public.platform_settings
  drop column if exists register_details;
