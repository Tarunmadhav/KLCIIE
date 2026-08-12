-- ============================================================================
-- KL CIIE Platform V2 — 0029: "Join CIIE" posts an application without an
-- account (email verification before posting).
--
-- Previously, every Join CIIE signup called supabase.auth.signUp, which created
-- an auth user + profile and then auto-created a recruit application. Now the
-- Join CIIE form only submits an application:
--   1. apply_to_ciie(...)        — anon RPC: validates and stores a pending
--                                  application (no account), returns its id.
--   2. send-recruit-email Edge Function (kind = 'join-verification') generates
--      the 6-digit code, stores its hash and emails it to the applicant.
--   3. verify_join_application() — anon RPC: checks the code and, only then,
--                                  posts the application into the recruit
--                                  pipeline (recruit_applications, stage 'gd').
--
-- Emails follow the architecture introduced in 0019: they are sent by the
-- send-recruit-email Edge Function with SMTP credentials in env secrets — the
-- verification code is generated there and never returned to the client.
--
-- recruit_applications becomes self-contained: member_id is now nullable and
-- the applicant's identity is copied onto the row so the GD / Interview / Final
-- Selection pages and the congratulation mail keep working without an account.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) recruit_applications: identity lives on the application, not the profile
-- ---------------------------------------------------------------------------
alter table public.recruit_applications alter column member_id drop not null;

alter table public.recruit_applications
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists student_id text,
  add column if not exists phone text,
  add column if not exists department text,
  add column if not exists year_of_study text,
  add column if not exists interview_batch smallint check (interview_batch in (1, 2)),
  add column if not exists join_fields jsonb default '{}'::jsonb;

-- Backfill existing applications from their profiles.
update public.recruit_applications a
set email = p.email,
    full_name = p.full_name,
    student_id = p.student_id,
    phone = p.phone,
    department = p.department,
    year_of_study = p.year_of_study,
    interview_batch = p.interview_batch,
    join_fields = coalesce(p.custom_fields, '{}'::jsonb)
from public.profiles p
where a.member_id = p.id
  and a.email is null;

-- ---------------------------------------------------------------------------
-- 2) join_applications: pre-pipeline bucket (pending / submitted / expired)
-- ---------------------------------------------------------------------------
create table if not exists public.join_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  student_id text,
  phone text,
  department text,
  year_of_study text,
  fields jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'expired')),
  code_hash text,
  code_expires_at timestamptz,
  code_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz
);

create index if not exists join_applications_email_idx on public.join_applications (email);
create index if not exists join_applications_status_idx on public.join_applications (status);

drop trigger if exists touch_join_applications on public.join_applications;
create trigger touch_join_applications before update on public.join_applications
  for each row execute function public.touch_updated_at();

-- Anon / authenticated can never touch join_applications directly — only the
-- security-definer RPCs below (which own the code hash) and the service-role
-- Edge Function (code generation / email) do.
alter table public.join_applications enable row level security;

-- pgcrypto lives in the "extensions" schema on Supabase (not "public"), so pin
-- `search_path = ''` functions cannot call digest() directly. Expose a public
-- wrapper (mirrors the hmac / gen_random_bytes wrappers from 0008).
do $body$
begin
  if to_regprocedure('extensions.digest(text,text)') is not null
     and to_regprocedure('public.digest(text,text)') is null then
    create function public.digest(data text, pg_type text)
    returns bytea language sql immutable strict as $fn$
      select extensions.digest(data, pg_type);
    $fn$;
  end if;
end;
$body$;

-- ---------------------------------------------------------------------------
-- 3) apply_to_ciie: submit a Join CIIE application (no account)
--    Returns { application_id, to_email, full_name }. The verification code is
--    generated and emailed by the send-recruit-email Edge Function.
-- ---------------------------------------------------------------------------
create or replace function public.apply_to_ciie(
  p_full_name text,
  p_email text,
  p_student_id text default null,
  p_phone text default null,
  p_department text default null,
  p_year_of_study text default null,
  p_fields jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_settings public.platform_settings%rowtype;
  v_domain text;
  v_allowed text;
  v_id uuid;
begin
  -- Public signup toggle.
  select * into v_settings from public.platform_settings where id = 1;
  if not v_settings.allow_public_signup then
    raise exception 'Recruitment is currently closed.';
  end if;

  -- Basic validation.
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'Please enter your full name.';
  end if;
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'Please enter a valid email address.';
  end if;
  if p_student_id is null or btrim(p_student_id) = '' then
    raise exception 'Please enter your student ID.';
  end if;

  -- KL University email restriction (mirrors the signup page + role registration).
  if v_settings.signup_domain_restriction then
    v_domain := lower(split_part(lower(p_email), '@', 2));
    select string_agg('@' || btrim(d), ', ' order by d)
      into v_allowed
      from unnest(v_settings.signup_allowed_domains) as d;
    if v_allowed is null or v_domain is null or v_domain = ''
       or not exists (
         select 1
         from unnest(v_settings.signup_allowed_domains) as d
         where v_domain = lower(btrim(d)) or v_domain like '%.' || lower(btrim(d))
       ) then
      raise exception 'Registration is limited to % email addresses.',
        coalesce(v_allowed, 'KL University');
    end if;
  end if;

  -- One pending application per email; re-applying reuses the row (the Edge
  -- Function will mint a fresh code on top of it).
  select id into v_id
  from public.join_applications
  where lower(email) = lower(btrim(p_email)) and status in ('pending', 'expired')
  order by created_at desc limit 1;

  if v_id is null then
    insert into public.join_applications (
      email, full_name, student_id, phone, department, year_of_study, fields,
      status, code_hash, code_expires_at, code_attempts
    )
    values (
      lower(btrim(p_email)), btrim(p_full_name), nullif(btrim(coalesce(p_student_id, '')), ''),
      nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_department, '')), ''),
      nullif(btrim(coalesce(p_year_of_study, '')), ''),
      coalesce(p_fields, '{}'::jsonb),
      'pending', null, null, 0
    )
    returning id into v_id;
  else
    update public.join_applications
    set full_name = btrim(p_full_name),
        student_id = nullif(btrim(coalesce(p_student_id, '')), ''),
        phone = nullif(btrim(coalesce(p_phone, '')), ''),
        department = nullif(btrim(coalesce(p_department, '')), ''),
        year_of_study = nullif(btrim(coalesce(p_year_of_study, '')), ''),
        fields = coalesce(p_fields, '{}'::jsonb),
        status = 'pending',
        code_hash = null,
        code_expires_at = null,
        code_attempts = 0,
        verified_at = null
    where id = v_id;
  end if;

  return jsonb_build_object(
    'application_id', v_id,
    'to_email', lower(btrim(p_email)),
    'full_name', btrim(p_full_name)
  );
end;
$$;

grant execute on function public.apply_to_ciie(text, text, text, text, text, text, jsonb)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) RESEND: handled by the same Edge Function (kind = 'join-verification').
--    Calling send-recruit-email again with an application id re-mints the code
--    and emails it, so no separate RPC is needed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5) verify_join_application: check the code, then post into the pipeline
-- ---------------------------------------------------------------------------
create or replace function public.verify_join_application(p_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.join_applications%rowtype;
  v_batch smallint;
  v_count bigint;
  v_app_id uuid;
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter the 6-digit code you received by email.');
  end if;

  select * into v_row from public.join_applications where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Application not found. Please apply again.');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'This application is already submitted or has expired.');
  end if;
  if v_row.code_hash is null then
    return jsonb_build_object('ok', false, 'error', 'No verification code has been issued yet. Please try again in a moment.');
  end if;
  if v_row.code_expires_at is null or v_row.code_expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'The code has expired. Request a new code.');
  end if;
  if v_row.code_attempts >= 5 then
    update public.join_applications set status = 'expired' where id = p_id;
    return jsonb_build_object('ok', false, 'error', 'Too many wrong attempts. Please apply again for a fresh code.');
  end if;

  if encode(public.digest(upper(btrim(p_code)), 'sha256'), 'hex') <> v_row.code_hash then
    update public.join_applications set code_attempts = code_attempts + 1 where id = p_id;
    return jsonb_build_object('ok', false, 'error', 'That code is incorrect. Please check your email and try again.');
  end if;

  -- Alternating interview batch by application order (mirrors handle_new_user).
  select count(*) into v_count from public.recruit_applications where stage <> 'rejected';
  v_batch := case when v_count % 2 = 0 then 1 else 2 end;

  insert into public.recruit_applications (
    member_id, email, full_name, student_id, phone, department, year_of_study,
    interview_batch, join_fields, stage
  )
  values (
    null, v_row.email, v_row.full_name, v_row.student_id, v_row.phone,
    v_row.department, v_row.year_of_study, v_batch, v_row.fields, 'gd'
  )
  returning id into v_app_id;

  update public.join_applications
  set status = 'submitted', verified_at = now(), code_attempts = code_attempts + 1
  where id = p_id;

  return jsonb_build_object(
    'ok', true, 'error', null, 'application_id', v_app_id,
    'batch', v_batch, 'full_name', v_row.full_name, 'email', v_row.email
  );
end;
$$;

grant execute on function public.verify_join_application(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) get_recruit_applications: applicant identity from the application row
-- ---------------------------------------------------------------------------
create or replace function public.get_recruit_applications()
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
      ie_ev.remarks,
      ie_ev.responses,
      a.created_at
    from public.recruit_applications a
    left join public.profiles p on p.id = a.member_id
    left join public.profiles dp on dp.id = a.decided_by
    left join public.recruit_form_templates gft on gft.id = a.gd_form_id
    left join public.recruit_form_templates ift on ift.id = a.interview_form_id
    left join public.recruit_evaluations ge_ev on ge_ev.application_id = a.id and ge_ev.kind = 'gd'
    left join public.profiles ge on ge.id = ge_ev.evaluator_id
    left join public.recruit_evaluations ie_ev on ie_ev.application_id = a.id and ie_ev.kind = 'interview'
    left join public.profiles ie on ie.id = ie_ev.evaluator_id
    order by a.created_at asc;
end;
$$;

grant execute on function public.get_recruit_applications() to authenticated;

-- ---------------------------------------------------------------------------
-- 7) select_recruit: mark selected and RETURN the email payload (the frontend
--    hands it to the send-recruit-email Edge Function). Identity comes from
--    the application row when the applicant has no account.
-- ---------------------------------------------------------------------------
create or replace function public.select_recruit(
  p_application_id uuid,
  p_message text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.recruit_applications%rowtype;
  v_profile public.profiles%rowtype;
  v_email text;
  v_name text;
  v_subject text;
  v_plain text;
  v_html text;
begin
  if not (public.is_admin() or public.is_ciie_member()) then
    raise exception 'Not authorized';
  end if;
  if p_message is null or btrim(p_message) = '' then
    raise exception 'A congratulation message is required before approving a recruit';
  end if;

  select * into v_app from public.recruit_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found';
  end if;
  if v_app.stage <> 'final' then
    raise exception 'Applicant must complete both the GD and Interview rounds first';
  end if;

  if v_app.member_id is not null then
    select * into v_profile from public.profiles where id = v_app.member_id;
  end if;
  v_email := coalesce(v_app.email, v_profile.email);
  v_name := coalesce(v_app.full_name, v_profile.full_name);
  if v_email is null then
    raise exception 'Applicant has no email address on file';
  end if;

  update public.recruit_applications
  set stage = 'selected',
      final_decision = 'selected',
      final_message = btrim(p_message),
      decided_by = auth.uid(),
      decided_at = now(),
      updated_at = now()
  where id = p_application_id
  returning * into v_app;

  v_subject := 'Congratulations ' || coalesce(v_name, '') || ' — you are selected to join KL CIIE!';
  v_plain := 'Dear ' || coalesce(v_name, '') || E'\n\n'
          || 'Congratulations! On behalf of KL CIIE we are delighted to welcome you as an official member of the KL CIIE team.' || E'\n\n'
          || 'Message from the selection team:' || E'\n'
          || btrim(p_message) || E'\n\n'
          || 'We look forward to working with you.' || E'\n\n'
          || 'Regards,' || E'\n' || 'KL CIIE';
  v_html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">'
         || '<div style="background:#4f46e5;padding:22px 28px;text-align:center">'
         || '<span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:1px">KL CIIE</span></div>'
         || '<div style="padding:28px;color:#0f172a;font-size:15px;line-height:1.6">'
         || '<h2 style="margin:0 0 14px;color:#0f172a">Congratulations ' || coalesce(v_name, '') || '!</h2>'
         || '<p style="margin:0 0 12px">On behalf of <strong>KL CIIE</strong>, we are delighted to welcome you as an official member of the KL CIIE team.</p>'
         || '<p style="margin:0 0 8px"><strong>Message from the selection team:</strong></p>'
         || '<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:4px solid #4f46e5;background:#eef2ff;border-radius:6px;color:#1e293b">'
         || replace(btrim(p_message), E'\n', '<br/>') || '</blockquote>'
         || '<p style="margin:0 0 20px">We look forward to working with you this year.</p>'
         || '<p style="margin:0">Regards,<br/><strong>KL CIIE</strong></p>'
         || '</div></div>';

  return jsonb_build_object(
    'application_id', p_application_id,
    'to_email', v_email,
    'full_name', v_name,
    'subject', v_subject,
    'text', v_plain,
    'html', v_html
  );
end;
$$;

grant execute on function public.select_recruit(uuid, text) to authenticated;
