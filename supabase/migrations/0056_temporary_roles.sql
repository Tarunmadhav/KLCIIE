-- ============================================================================
-- KL CIIE Platform V2 — 0056: Temporary role change
--
-- Admins can give a user a different role until a chosen date & time; after
-- that moment the profile automatically reverts to its previous role.
--
-- Mechanics:
--   * profiles.pre_temp_role        — role to restore when the window ends
--   * profiles.temp_role_expires_at — revert deadline (profiles.role is the
--                                     temporary role while this is in future)
--   * expire_temporary_roles()      — security definer sweep that reverts every
--     expired row and fixes the MFA-required flag for restored admin roles.
--     Triggered lazily on every successful login (record_login) and callable
--     by the admin UI; additionally scheduled every minute via pg_cron when
--     that extension is available (silently skipped otherwise).
-- ============================================================================

alter table public.profiles
  add column if not exists pre_temp_role text,
  add column if not exists temp_role_expires_at timestamptz;

create or replace function public.expire_temporary_roles()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles
  set role = coalesce(pre_temp_role, 'user'),
      pre_temp_role = null,
      temp_role_expires_at = null,
      mfa_setup_required = coalesce(pre_temp_role, 'user') in (
        'super_admin', 'main_admin', 'event_admin', 'member_admin',
        'content_admin', 'gallery_admin', 'reports_admin',
        'attendance_coordinator', 'mail_admin'
      )
  where temp_role_expires_at is not null
    and now() >= temp_role_expires_at;
end;
$$;

grant execute on function public.expire_temporary_roles() to authenticated;

-- Lazy safety net: every successful login first sweeps expired temp roles,
-- so a user whose window ended regains their original role at next login even
-- without cron.
create or replace function public.record_login(p_user_id uuid, p_success boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.expire_temporary_roles();
  if p_success then
    update public.profiles set last_login_at = now() where id = p_user_id;
    if exists (select 1 from public.profiles where id = p_user_id and role not in ('member', 'user')) then
      insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id)
      values (p_user_id, 'Admin Login', 'admin', p_user_id::text);
    end if;
  else
    insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id)
    values (p_user_id, 'Failed Admin Login', 'admin', p_user_id::text);
  end if;
end;
$$;

grant execute on function public.record_login(uuid, boolean) to authenticated;

-- Preferred driver: run the sweep every minute with pg_cron when available.
do $do$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'expire-temporary-roles';
  perform cron.schedule(
    'expire-temporary-roles',
    '* * * * *',
    $cron$ select public.expire_temporary_roles(); $cron$
  );
exception
  when others then
    -- pg_cron not available on this project — lazy expiry still applies.
    null;
end $do$;
