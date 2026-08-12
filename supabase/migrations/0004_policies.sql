-- ============================================================================
-- KL CIIE Platform V2 — 0004: RLS policies + storage
-- Pattern for admin access: permissive role/self policy + a RESTRICTIVE
-- policy that requires the aal2 JWT claim. This enforces MFA at the
-- database layer — hitting the REST API directly cannot bypass it.
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.member_privacy_settings enable row level security;
alter table public.events enable row level security;
alter table public.event_roles enable row level security;
alter table public.event_team_members enable row level security;
alter table public.point_rules enable row level security;
alter table public.member_points_transactions enable row level security;
alter table public.member_achievements enable row level security;
alter table public.event_registrations enable row level security;
alter table public.attendance enable row level security;
alter table public.certificates enable row level security;
alter table public.gallery_items enable row level security;
alter table public.announcements enable row level security;
alter table public.posts enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_recovery_codes enable row level security;
alter table public.branding_settings enable row level security;
alter table public.member_qr_codes enable row level security;

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------
drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles
  for select to anon
  using (
    status = 'active'
    and exists (select 1 from public.member_privacy_settings s
                where s.member_id = id and s.show_public_profile)
  );

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles
  for select to authenticated
  using (public.is_admin());

drop policy if exists profiles_admin_read_mfa on public.profiles;
create policy profiles_admin_read_mfa on public.profiles
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.admin_aal2());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists profiles_admin_update_mfa on public.profiles;
create policy profiles_admin_update_mfa on public.profiles
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin())
  with check ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
  for delete to authenticated
  using (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- MEMBER PRIVACY SETTINGS
-- ---------------------------------------------------------------------------
drop policy if exists privacy_self_select on public.member_privacy_settings;
create policy privacy_self_select on public.member_privacy_settings
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists privacy_admin_select on public.member_privacy_settings;
create policy privacy_admin_select on public.member_privacy_settings
  for select to authenticated
  using (public.is_admin());

drop policy if exists privacy_admin_select_mfa on public.member_privacy_settings;
create policy privacy_admin_select_mfa on public.member_privacy_settings
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists privacy_self_upsert on public.member_privacy_settings;
create policy privacy_self_upsert on public.member_privacy_settings
  for insert to authenticated
  with check (member_id = auth.uid());

drop policy if exists privacy_self_update on public.member_privacy_settings;
create policy privacy_self_update on public.member_privacy_settings
  for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

drop policy if exists privacy_admin_update on public.member_privacy_settings;
create policy privacy_admin_update on public.member_privacy_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists privacy_admin_update_mfa on public.member_privacy_settings;
create policy privacy_admin_update_mfa on public.member_privacy_settings
  as restrictive for update to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin())
  with check ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

-- ---------------------------------------------------------------------------
-- EVENTS
-- ---------------------------------------------------------------------------
drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events
  for select to anon
  using (status = 'published');

drop policy if exists events_member_read on public.events;
create policy events_member_read on public.events
  for select to authenticated
  using (status in ('published', 'completed') or public.is_admin());

drop policy if exists events_member_read_mfa on public.events;
create policy events_member_read_mfa on public.events
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists events_admin_insert on public.events;
create policy events_admin_insert on public.events
  for insert to authenticated
  with check (public.admin_aal2());

drop policy if exists events_admin_update on public.events;
create policy events_admin_update on public.events
  for update to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

drop policy if exists events_admin_delete on public.events;
create policy events_admin_delete on public.events
  for delete to authenticated
  using (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- EVENT ROLES
-- ---------------------------------------------------------------------------
drop policy if exists roles_public_read on public.event_roles;
create policy roles_public_read on public.event_roles
  for select to anon
  using (is_active);

drop policy if exists roles_member_read on public.event_roles;
create policy roles_member_read on public.event_roles
  for select to authenticated
  using (true);

drop policy if exists roles_member_read_mfa on public.event_roles;
create policy roles_member_read_mfa on public.event_roles
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists roles_admin_write on public.event_roles;
create policy roles_admin_write on public.event_roles
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- EVENT TEAM MEMBERS
-- ---------------------------------------------------------------------------
drop policy if exists team_public_read on public.event_team_members;
create policy team_public_read on public.event_team_members
  for select to anon
  using (
    is_public
    and exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
  );

drop policy if exists team_self_read on public.event_team_members;
create policy team_self_read on public.event_team_members
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists team_admin_read on public.event_team_members;
create policy team_admin_read on public.event_team_members
  for select to authenticated
  using (public.is_admin());

drop policy if exists team_admin_read_mfa on public.event_team_members;
create policy team_admin_read_mfa on public.event_team_members
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists team_admin_write on public.event_team_members;
create policy team_admin_write on public.event_team_members
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- POINT RULES
-- ---------------------------------------------------------------------------
drop policy if exists rules_member_read on public.point_rules;
create policy rules_member_read on public.point_rules
  for select to authenticated
  using (true);

drop policy if exists rules_member_read_mfa on public.point_rules;
create policy rules_member_read_mfa on public.point_rules
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists rules_admin_write on public.point_rules;
create policy rules_admin_write on public.point_rules
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- MEMBER POINTS TRANSACTIONS
-- ---------------------------------------------------------------------------
drop policy if exists points_self_read on public.member_points_transactions;
create policy points_self_read on public.member_points_transactions
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists points_admin_read on public.member_points_transactions;
create policy points_admin_read on public.member_points_transactions
  for select to authenticated
  using (public.is_admin());

drop policy if exists points_admin_read_mfa on public.member_points_transactions;
create policy points_admin_read_mfa on public.member_points_transactions
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists points_admin_insert on public.member_points_transactions;
create policy points_admin_insert on public.member_points_transactions
  for insert to authenticated
  with check (public.admin_aal2());

drop policy if exists points_admin_delete on public.member_points_transactions;
create policy points_admin_delete on public.member_points_transactions
  for delete to authenticated
  using (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- MEMBER ACHIEVEMENTS
-- ---------------------------------------------------------------------------
drop policy if exists achievements_self_read on public.member_achievements;
create policy achievements_self_read on public.member_achievements
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists achievements_admin_read on public.member_achievements;
create policy achievements_admin_read on public.member_achievements
  for select to authenticated
  using (public.is_admin());

drop policy if exists achievements_admin_read_mfa on public.member_achievements;
create policy achievements_admin_read_mfa on public.member_achievements
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists achievements_admin_write on public.member_achievements;
create policy achievements_admin_write on public.member_achievements
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- EVENT REGISTRATIONS
-- ---------------------------------------------------------------------------
drop policy if exists reg_self_read on public.event_registrations;
create policy reg_self_read on public.event_registrations
  for select to authenticated
  using (member_id = auth.uid() or email = (select auth.jwt() ->> 'email'));

drop policy if exists reg_admin_read on public.event_registrations;
create policy reg_admin_read on public.event_registrations
  for select to authenticated
  using (public.is_admin());

drop policy if exists reg_admin_read_mfa on public.event_registrations;
create policy reg_admin_read_mfa on public.event_registrations
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists reg_self_insert on public.event_registrations;
create policy reg_self_insert on public.event_registrations
  for insert to authenticated
  with check (member_id = auth.uid() or member_id is null);

drop policy if exists reg_self_update on public.event_registrations;
create policy reg_self_update on public.event_registrations
  for update to authenticated
  using (member_id = auth.uid() or email = (select auth.jwt() ->> 'email'))
  with check (member_id = auth.uid() or email = (select auth.jwt() ->> 'email'));

drop policy if exists reg_admin_write on public.event_registrations;
create policy reg_admin_write on public.event_registrations
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- ATTENDANCE
-- ---------------------------------------------------------------------------
drop policy if exists attendance_self_read on public.attendance;
create policy attendance_self_read on public.attendance
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists attendance_admin_read on public.attendance;
create policy attendance_admin_read on public.attendance
  for select to authenticated
  using (public.is_admin());

drop policy if exists attendance_admin_read_mfa on public.attendance;
create policy attendance_admin_read_mfa on public.attendance
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists attendance_admin_write on public.attendance;
create policy attendance_admin_write on public.attendance
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- CERTIFICATES
-- ---------------------------------------------------------------------------
drop policy if exists certs_self_read on public.certificates;
create policy certs_self_read on public.certificates
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists certs_admin_read on public.certificates;
create policy certs_admin_read on public.certificates
  for select to authenticated
  using (public.is_admin());

drop policy if exists certs_admin_read_mfa on public.certificates;
create policy certs_admin_read_mfa on public.certificates
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists certs_admin_write on public.certificates;
create policy certs_admin_write on public.certificates
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- GALLERY
-- ---------------------------------------------------------------------------
drop policy if exists gallery_public_read on public.gallery_items;
create policy gallery_public_read on public.gallery_items
  for select to anon
  using (true);

drop policy if exists gallery_member_read on public.gallery_items;
create policy gallery_member_read on public.gallery_items
  for select to authenticated
  using (true);

drop policy if exists gallery_admin_write on public.gallery_items;
create policy gallery_admin_write on public.gallery_items
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- ANNOUNCEMENTS
-- ---------------------------------------------------------------------------
drop policy if exists ann_public_read on public.announcements;
create policy ann_public_read on public.announcements
  for select to anon
  using (
    audience = 'all'
    and (expires_at is null or expires_at > now())
  );

drop policy if exists ann_member_read on public.announcements;
create policy ann_member_read on public.announcements
  for select to authenticated
  using (
    (audience in ('all', 'members') and (expires_at is null or expires_at > now()))
    or public.is_admin()
  );

drop policy if exists ann_member_read_mfa on public.announcements;
create policy ann_member_read_mfa on public.announcements
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists ann_admin_write on public.announcements;
create policy ann_admin_write on public.announcements
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- CMS POSTS
-- ---------------------------------------------------------------------------
drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
  for select to anon
  using (published);

drop policy if exists posts_member_read on public.posts;
create policy posts_member_read on public.posts
  for select to authenticated
  using (published or public.is_admin());

drop policy if exists posts_member_read_mfa on public.posts;
create policy posts_member_read_mfa on public.posts
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists posts_admin_write on public.posts;
create policy posts_admin_write on public.posts
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- ADMIN AUDIT LOGS
-- ---------------------------------------------------------------------------
drop policy if exists audit_admin_read on public.admin_audit_logs;
create policy audit_admin_read on public.admin_audit_logs
  for select to authenticated
  using (public.is_admin());

drop policy if exists audit_admin_read_mfa on public.admin_audit_logs;
create policy audit_admin_read_mfa on public.admin_audit_logs
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

-- No insert/update/delete policies: only security definer functions write logs.

-- ---------------------------------------------------------------------------
-- ADMIN RECOVERY CODES — no direct table access; functions only.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- BRANDING SETTINGS
-- ---------------------------------------------------------------------------
drop policy if exists branding_public_read on public.branding_settings;
create policy branding_public_read on public.branding_settings
  for select to anon
  using (true);

drop policy if exists branding_member_read on public.branding_settings;
create policy branding_member_read on public.branding_settings
  for select to authenticated
  using (true);

drop policy if exists branding_admin_write on public.branding_settings;
create policy branding_admin_write on public.branding_settings
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- MEMBER QR CODES
-- ---------------------------------------------------------------------------
drop policy if exists member_qr_self_read on public.member_qr_codes;
create policy member_qr_self_read on public.member_qr_codes
  for select to authenticated
  using (member_id = auth.uid());

drop policy if exists member_qr_admin_read on public.member_qr_codes;
create policy member_qr_admin_read on public.member_qr_codes
  for select to authenticated
  using (public.is_admin());

drop policy if exists member_qr_admin_read_mfa on public.member_qr_codes;
create policy member_qr_admin_read_mfa on public.member_qr_codes
  as restrictive for select to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2' or not public.is_super_admin());

drop policy if exists member_qr_admin_write on public.member_qr_codes;
create policy member_qr_admin_write on public.member_qr_codes
  for all to authenticated
  using (public.admin_aal2())
  with check (public.admin_aal2());

-- ---------------------------------------------------------------------------
-- VIEWS — grant select (RLS on underlying tables still applies via invoker)
-- ---------------------------------------------------------------------------
grant select on public.v_member_stats to authenticated;
grant select on public.v_event_stats to authenticated;

-- ---------------------------------------------------------------------------
-- STORAGE: branding + media buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true), ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists storage_branding_read on storage.objects;
create policy storage_branding_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'branding' or bucket_id = 'media');

drop policy if exists storage_branding_admin_write on storage.objects;
create policy storage_branding_admin_write on storage.objects
  for insert to authenticated
  with check ((bucket_id = 'branding' or bucket_id = 'media') and public.admin_aal2());

drop policy if exists storage_branding_admin_update on storage.objects;
create policy storage_branding_admin_update on storage.objects
  for update to authenticated
  using ((bucket_id = 'branding' or bucket_id = 'media') and public.admin_aal2())
  with check ((bucket_id = 'branding' or bucket_id = 'media') and public.admin_aal2());

drop policy if exists storage_branding_admin_delete on storage.objects;
create policy storage_branding_admin_delete on storage.objects
  for delete to authenticated
  using ((bucket_id = 'branding' or bucket_id = 'media') and public.admin_aal2());

-- ---------------------------------------------------------------------------
-- FUNCTION GRANTS
-- ---------------------------------------------------------------------------
grant execute on function public.is_admin(uuid) to anon, authenticated;
grant execute on function public.is_super_admin(uuid) to anon, authenticated;
grant execute on function public.admin_aal2() to anon, authenticated;
grant execute on function public.get_leaderboard(text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_member_rank(uuid) to anon, authenticated;
grant execute on function public.get_public_member(uuid) to anon, authenticated;
grant execute on function public.get_member_events_worked(uuid) to anon, authenticated;
grant execute on function public.create_registration(uuid, text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.award_points(uuid, integer, text, text, uuid, text, uuid) to authenticated;
grant execute on function public.mark_attendance(uuid, text, text, text) to authenticated;
grant execute on function public.set_attendance(uuid, text) to authenticated;
grant execute on function public.generate_recovery_codes(text[]) to authenticated;
grant execute on function public.use_recovery_code(text) to authenticated;
grant execute on function public.reset_admin_mfa(uuid) to authenticated;
grant execute on function public.record_login(uuid, boolean) to authenticated;
grant execute on function public.get_points_stats() to authenticated;
grant execute on function public.get_audit_logs(integer) to authenticated;

-- Admin event stats RPC (aggregate, admin-only).
create or replace function public.admin_get_event_stats()
returns table (
  event_id uuid, title text, status text, start_date date,
  registrations bigint, present bigint, absent bigint, team_size bigint, certificates bigint
)
language sql stable security definer set search_path = ''
as $$
  select id, title, status, start_date,
    (select count(*) from public.event_registrations r where r.event_id = e.id),
    (select count(*) from public.attendance a where a.event_id = e.id and a.status = 'present'),
    (select count(*) from public.attendance a where a.event_id = e.id and a.status = 'absent'),
    (select count(*) from public.event_team_members t where t.event_id = e.id),
    (select count(*) from public.certificates c where c.event_id = e.id)
  from public.events e
  where public.is_admin()
  order by e.start_date desc;
$$;
grant execute on function public.admin_get_event_stats() to authenticated;

-- Audit log writer used by the client for MFA security events.
create or replace function public.log_admin_event(
  p_action text, p_entity_type text default null, p_entity_id text default null, p_details jsonb default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_details);
end;
$$;
grant execute on function public.log_admin_event(text, text, text, jsonb) to authenticated;
