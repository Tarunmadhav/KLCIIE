-- ---------------------------------------------------------------------------
-- 0069: Clean up ghost recruit_applications + orphaned data
--
-- Problem: The create_recruit_application_on_profile trigger (0018) was
-- creating recruit_applications for EVERY new profile with role='member',
-- INCLUDING bulk-imported members.  Migration 0063 fixed the trigger to
-- skip service_role, but ghost rows were already created for earlier imports.
--
-- These ghost rows have member_id set but full_name/email are NULL in
-- recruit_applications (the trigger only copies member_id).
--
-- This migration:
--   1) Deletes all recruit_applications + evaluations where the profile
--      no longer has a matching auth.users row (orphaned profiles).
--   2) Deletes ghost recruit_applications auto-created by the trigger for
--      bulk-imported members (profile exists but application has no real
--      identity data and no pipeline activity).
--   3) Deletes the orphaned profiles themselves.
--   4) Updates get_recruit_applications() with a defensive WHERE clause.
-- ---------------------------------------------------------------------------

-- 1) Delete evaluations linked to ghost/orphaned applications
delete from public.recruit_evaluations e
using public.recruit_applications a
where e.application_id = a.id
  and (
    -- orphaned: profile no longer exists
    (a.member_id is not null and not exists (select 1 from public.profiles p where p.id = a.member_id))
    or
    -- ghost trigger entry: profile exists but application has no identity
    -- data AND no pipeline activity (never went through GD/interview)
    (a.member_id is not null
     and a.full_name is null
     and a.email is null
     and a.gd_submitted_at is null
     and a.interview_submitted_at is null
     and a.final_decision is null
     and not exists (select 1 from public.recruit_evaluations e2 where e2.application_id = a.id)
    )
  );

-- 2) Delete ghost/orphaned recruit_applications
delete from public.recruit_applications a
where (
    -- orphaned: profile no longer exists
    (a.member_id is not null and not exists (select 1 from public.profiles p where p.id = a.member_id))
    or
    -- ghost trigger entry for bulk-imported members
    (a.member_id is not null
     and a.full_name is null
     and a.email is null
     and a.gd_submitted_at is null
     and a.interview_submitted_at is null
     and a.final_decision is null
    )
  );

-- 3) Delete orphaned profiles (no matching auth.users)
delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

-- 4) Replace get_recruit_applications — volatile (no caching) + defensive
--    WHERE clause to skip any future ghosts.
drop function if exists public.get_recruit_applications();

create function public.get_recruit_applications()
returns table (
  application_id uuid,
  member_id uuid,
  stage text,
  full_name text,
  ciie_id text,
  student_id text,
  email text,
  phone text,
  department text,
  year_of_study text,
  interview_batch smallint,
  gd_form_id uuid,
  gd_form_title text,
  gd_form_fields jsonb,
  interview_form_id uuid,
  interview_form_title text,
  interview_form_fields jsonb,
  gd_submitted_at timestamptz,
  interview_submitted_at timestamptz,
  final_decision text,
  final_message text,
  decided_by text,
  decided_at timestamptz,
  gd_evaluator text,
  gd_remarks text,
  gd_responses jsonb,
  interview_evaluator text,
  interview_remarks text,
  interview_responses jsonb,
  interview_evaluations jsonb,
  created_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.is_admin() or public.is_ciie_member()) then
    raise exception 'Not authorized';
  end if;
  return query
    select
      a.id,
      a.member_id,
      a.stage,
      coalesce(a.full_name, p.full_name),
      p.ciie_id,
      coalesce(a.student_id, p.student_id),
      coalesce(a.email, p.email),
      coalesce(a.phone, p.phone),
      coalesce(a.department, p.department),
      coalesce(a.year_of_study, p.year_of_study),
      coalesce(a.interview_batch, p.interview_batch),
      a.gd_form_id,
      gft.title,
      gft.fields,
      a.interview_form_id,
      ift.title,
      ift.fields,
      a.gd_submitted_at,
      a.interview_submitted_at,
      a.final_decision,
      a.final_message,
      dp.full_name,
      a.decided_at,
      ge.full_name,
      ge_ev.remarks,
      ge_ev.responses,
      ie.full_name,
      latest_ie.remarks,
      latest_ie.responses,
      coalesce(ie_all.evals, '[]'::jsonb),
      a.created_at
    from public.recruit_applications a
    left join public.profiles p on p.id = a.member_id
    left join public.profiles dp on dp.id = a.decided_by
    left join public.recruit_form_templates gft on gft.id = a.gd_form_id
    left join public.recruit_form_templates ift on ift.id = a.interview_form_id
    left join public.recruit_evaluations ge_ev on ge_ev.application_id = a.id and ge_ev.kind = 'gd'
    left join public.profiles ge on ge.id = ge_ev.evaluator_id
    left join lateral (
      select e.remarks, e.responses, e.evaluator_id
      from public.recruit_evaluations e
      where e.application_id = a.id and e.kind = 'interview'
      order by e.submitted_at desc
      limit 1
    ) latest_ie on true
    left join public.profiles ie on ie.id = latest_ie.evaluator_id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
          'evaluator_id', e.evaluator_id,
          'evaluator_name', ep.full_name,
          'evaluator_ciie_id', ep.ciie_id,
          'responses', e.responses,
          'remarks', e.remarks,
          'submitted_at', e.submitted_at
        ) order by e.submitted_at asc) as evals
      from public.recruit_evaluations e
      left join public.profiles ep on ep.id = e.evaluator_id
      where e.application_id = a.id and e.kind = 'interview'
    ) ie_all on true
    where
      -- Skip ghost trigger-created entries (no identity data)
      not (a.member_id is not null and a.full_name is null and a.email is null)
      -- Skip recruit_applications whose profile no longer exists
      and (a.member_id is null or p.id is not null)
    order by a.created_at asc;
end;
$$;

grant execute on function public.get_recruit_applications() to authenticated;

-- 5) Force PostgREST schema reload
select pg_notify('pgrst', 'reload schema');
