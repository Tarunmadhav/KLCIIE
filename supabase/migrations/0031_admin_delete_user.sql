-- ---------------------------------------------------------------------------
-- 0031: Admin delete user (removes auth account + profile end-to-end)
--
-- Used by the super-admin "User Roles" page. Deleting the auth.users row
-- cascades to public.profiles (profiles.id -> auth.users.id on delete cascade),
-- which in turn cascades/set-nulls every dependent record. A direct profile
-- delete is included as a safety net for orphaned rows.
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_user(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_email text;
begin
  if v_admin_id is null then
    return jsonb_build_object('error', 'Not authenticated');
  end if;
  if v_admin_id = p_user_id then
    return jsonb_build_object('error', 'You cannot delete your own account.');
  end if;
  if not public.is_super_admin(v_admin_id) then
    return jsonb_build_object('error', 'Forbidden — only super admins can delete users.');
  end if;
  if (auth.jwt() ->> 'aal') <> 'aal2' then
    return jsonb_build_object('error', 'MFA (two-factor) verification required to delete users.');
  end if;
  if not exists (select 1 from auth.users where id = p_user_id)
     and not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('error', 'No such user.');
  end if;

  select email into v_email from auth.users where id = p_user_id;

  begin
    delete from auth.users where id = p_user_id;
    delete from public.profiles where id = p_user_id;
  exception when others then
    return jsonb_build_object('error', sqlerrm);
  end;

  perform public.log_admin_event(
    'User Deleted',
    'user',
    p_user_id::text,
    jsonb_build_object('email', v_email)
  );

  return jsonb_build_object('ok', true, 'email', v_email);
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
