-- ============================================================================
-- 0058: Multi-evaluator interview opinions + explicit forward to Final Selection
--
-- Behaviour change:
--   * GD round: unchanged — one evaluation per applicant moves them to the
--     Interview round (the name leaves the GD list).
--   * Interview round: submitting an opinion NO LONGER moves the applicant.
--     They stay visible so other panelists can also submit their opinion.
--     Moving to Final Selection is now an explicit action
--     (forward_recruit_to_final), and even after forwarding, more opinions
--     can still be added.
--   * get_recruit_applications exposes every interview opinion together with
--     each evaluator's name and CIIE ID; the old single-evaluator columns
--     remain populated with the LATEST opinion for backwards compatibility.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Relax uniqueness: GD stays one-per-applicant; interview allows many
--    evaluations (one live opinion per evaluator per applicant).
-- ---------------------------------------------------------------------------
alter table public.recruit_evaluations
  drop constraint if exists recruit_evaluations_app_kind_unique;

create unique index if not exists recruit_evaluations_gd_unique
  on public.recruit_evaluations (application_id)
  where kind = 'gd';

create unique index if not exists recruit_evaluations_interview_once_per_evaluator
  on public.recruit_evaluations (application_id, evaluator_id)
  where kind = 'interview';

-- ---------------------------------------------------------------------------
-- 2) submit_recruit_evaluation: interview submissions keep the applicant in
--    the interview round; re-submitting replaces that evaluator's opinion.
-- ---------------------------------------------------------------------------
create or replace function public.submit_recruit_evaluation(
  p_application_id uuid,
  p_kind text,
  p_responses jsonb default '{}'::jsonb,
  p_remarks text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.recruit_applications%rowtype;
  v_form_id uuid;
  v_eval_id uuid;
begin
  if not (public.is_admin() or public.is_ciie_member()) then
    raise exception 'Not authorized';
  end if;
  if p_kind not in ('gd', 'interview') then
    raise exception 'Invalid evaluation kind';
  end if;

  select * into v_app from public.recruit_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;

  if p_kind = 'gd' then
    if v_app.stage <> 'gd' then
      raise exception 'The GD round has already been completed for this applicant';
    end if;
    select id into v_form_id
    from public.recruit_form_templates
    where kind = 'gd' and is_active
    order by created_at desc limit 1;
    if v_form_id is null then
      raise exception 'The GD form has not been configured yet. Ask an admin to create it.';
    end if;

    update public.recruit_applications
    set stage = 'interview', gd_submitted_at = now(), gd_form_id = v_form_id, updated_at = now()
    where id = p_application_id;

    delete from public.recruit_evaluations e
    where e.application_id = p_application_id and e.kind = 'gd';

    insert into public.recruit_evaluations (application_id, kind, evaluator_id, responses, remarks)
    values (p_application_id, 'gd', auth.uid(), coalesce(p_responses, '{}'::jsonb), p_remarks)
    returning id into v_eval_id;
  else
    -- Allowed while queued for interview AND after forwarding to Final
    -- Selection, so late opinions keep flowing in.
    if v_app.stage not in ('interview', 'final') or v_app.gd_submitted_at is null then
      raise exception 'Complete the GD round before the interview round';
    end if;
    select id into v_form_id
    from public.recruit_form_templates
    where kind = 'interview' and is_active
    order by created_at desc limit 1;
    if v_form_id is null then
      raise exception 'The Interview form has not been configured yet. Ask an admin to create it.';
    end if;

    update public.recruit_applications
    set interview_submitted_at = coalesce(interview_submitted_at, now()),
        interview_form_id = coalesce(interview_form_id, v_form_id),
        updated_at = now()
    where id = p_application_id;

    delete from public.recruit_evaluations e
    where e.application_id = p_application_id
      and e.kind = 'interview'
      and e.evaluator_id = auth.uid();

    insert into public.recruit_evaluations (application_id, kind, evaluator_id, responses, remarks)
    values (p_application_id, 'interview', auth.uid(), coalesce(p_responses, '{}'::jsonb), p_remarks)
    returning id into v_eval_id;
  end if;

  return v_eval_id;
end;
$$;

grant execute on function public.submit_recruit_evaluation(uuid, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) forward_recruit_to_final: explicit hand-off to Final Selection.
-- ---------------------------------------------------------------------------
create or replace function public.forward_recruit_to_final(p_application_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_stage text;
begin
  if not (public.is_admin() or public.is_ciie_member()) then
    raise exception 'Not authorized';
  end if;
  select stage into v_stage from public.recruit_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;
  if v_stage <> 'interview' then
    raise exception 'Only applicants in the Interview round can be forwarded';
  end if;
  update public.recruit_applications
  set stage = 'final', updated_at = now()
  where id = p_application_id;
end;
$$;

grant execute on function public.forward_recruit_to_final(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) get_recruit_applications: all interview opinions + legacy latest columns
--    (dropped first: the return signature gains a column)
-- ---------------------------------------------------------------------------
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
language plpgsql stable security definer set search_path = ''
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
    order by a.created_at asc;
end;
$$;

grant execute on function public.get_recruit_applications() to authenticated;
