-- ============================================================================
-- 0063: Keep Live Registrations limited to Join CIIE (/signup) applicants.
--
-- The 0018 trigger created a recruit_applications row for EVERY inserted
-- profile with role='member'. Bulk Add Members (Excel import) runs through
-- the bulk-create-members Edge Function with the service_role key, so every
-- imported member was wrongly pushed into the recruitment pipeline.
--
-- 1) Trigger now skips service-role requests (bulk import path).
--    Real /signup applications are created by verify_join_application()
--    directly (member_id is null), so nothing else depends on this trigger.
-- 2) One-time cleanup: remove bare trigger-created rows for accounts that
--    were bulk-imported (active profile, no GD/interview activity, no
--    decision, no evaluations). Rows with ANY pipeline activity are kept.
-- ============================================================================

create or replace function public.create_recruit_application_on_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Bulk imports (Edge Functions authenticate with the service_role key)
  -- must never enter the recruitment pipeline.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if new.role = 'member' then
    insert into public.recruit_applications (member_id)
    values (new.id)
    on conflict (member_id) do nothing;
  end if;

  return new;
end;
$$;

-- Cleanup: drop untouched pipeline rows that were auto-created for
-- bulk-imported (already-active) accounts.
delete from public.recruit_applications a
using public.profiles p
where p.id = a.member_id
  and p.status = 'active'
  and a.final_decision is null
  and a.gd_form_id is null
  and a.interview_form_id is null
  and a.gd_submitted_at is null
  and a.interview_submitted_at is null
  and not exists (
    select 1 from public.recruit_evaluations e where e.application_id = a.id
  );
