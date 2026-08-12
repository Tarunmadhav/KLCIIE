-- ============================================================================
-- KL CIIE Platform V2 — 0018: recruitment workflow (GD → Interview → Selection)
--
-- Adds the full recruitment pipeline:
--   1. Every "Join CIIE" signup (a pending profile) becomes a recruit
--      application that appears LIVE in the GD round.
--   2. Admin defines the GD form and the Interview form (question templates).
--   3. CIIE members fill the GD form → application is forwarded to Interview.
--   4. CIIE members fill the Interview form (with the GD remarks visible)
--      → application is forwarded to Final Selection.
--   5. Final Selection: members approve individuals (mandatory congratulation
--      message) which sends an SMTP email, or request admin permission to
--      reject everyone except the approved ones.
--   6. Emails are sent through the pg_smtp_client extension using the Gmail
--      credentials stored by the super admin (Admin → SMTP).
--
-- IMPORTANT (one-time, run in the Supabase SQL editor if not already present):
--   create extension if not exists pg_smtp_client;
-- ============================================================================

-- ============================================================================
-- 1) SMTP CONFIG (separate table so the public platform_settings stay safe)
-- ============================================================================
create table if not exists public.recruit_smtp_settings (
  id integer primary key default 1 check (id = 1),
  email text,
  password text,
  host text not null default 'smtp.gmail.com',
  port integer not null default 587,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.recruit_smtp_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists touch_recruit_smtp_settings on public.recruit_smtp_settings;
create trigger touch_recruit_smtp_settings before update on public.recruit_smtp_settings
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 2) RECRUIT FORM TEMPLATES (GD / Interview questions defined by the admin)
-- ============================================================================
create table if not exists public.recruit_form_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('gd', 'interview')),
  title text not null,
  description text,
  fields jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists touch_recruit_form_templates on public.recruit_form_templates;
create trigger touch_recruit_form_templates before update on public.recruit_form_templates
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 3) RECRUIT APPLICATIONS (one row per applicant, pipeline stage)
-- ============================================================================
create table if not exists public.recruit_applications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  stage text not null default 'gd'
    check (stage in ('gd', 'interview', 'final', 'selected', 'rejected')),
  gd_form_id uuid references public.recruit_form_templates(id) on delete set null,
  interview_form_id uuid references public.recruit_form_templates(id) on delete set null,
  gd_submitted_at timestamptz,
  interview_submitted_at timestamptz,
  final_decision text check (final_decision in ('selected', 'rejected')),
  final_message text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruit_applications_member_unique unique (member_id)
);

create index if not exists recruit_applications_stage_idx on public.recruit_applications (stage);
create index if not exists recruit_applications_member_idx on public.recruit_applications (member_id);

drop trigger if exists touch_recruit_applications on public.recruit_applications;
create trigger touch_recruit_applications before update on public.recruit_applications
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 4) RECRUIT EVALUATIONS (the GD / Interview forms filled by CIIE members)
-- ============================================================================
create table if not exists public.recruit_evaluations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.recruit_applications(id) on delete cascade,
  kind text not null check (kind in ('gd', 'interview')),
  evaluator_id uuid not null references public.profiles(id) on delete set null,
  responses jsonb not null default '{}'::jsonb,
  remarks text,
  submitted_at timestamptz not null default now(),
  constraint recruit_evaluations_app_kind_unique unique (application_id, kind)
);

create index if not exists recruit_evaluations_app_idx on public.recruit_evaluations (application_id, kind);

-- ============================================================================
-- 5) RECRUIT REJECT-ALL PERMISSION REQUESTS
-- ============================================================================
create table if not exists public.recruit_reject_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'used')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists recruit_reject_requests_status_idx on public.recruit_reject_requests (status);
create index if not exists recruit_reject_requests_requester_idx on public.recruit_reject_requests (requested_by);

-- ============================================================================
-- 6) RECRUIT EMAIL LOG
-- ============================================================================
create table if not exists public.recruit_emails (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.recruit_applications(id) on delete set null,
  to_email text not null,
  subject text not null,
  body text,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz not null default now()
);

-- ============================================================================
-- 7) AUTO-CREATE AN APPLICATION FOR EVERY PENDING "Join CIIE" SIGNUP
-- ============================================================================
create or replace function public.create_recruit_application_on_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role = 'member' then
    insert into public.recruit_applications (member_id)
    values (new.id)
    on conflict (member_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists recruit_application_on_profile on public.profiles;
create trigger recruit_application_on_profile
  after insert on public.profiles
  for each row execute function public.create_recruit_application_on_profile();

-- Backfill: existing pending applicants already in the database.
insert into public.recruit_applications (member_id)
select id from public.profiles
where status = 'pending' and role = 'member'
on conflict (member_id) do nothing;

-- ============================================================================
-- 8) RPC: admin defines the GD / Interview form
-- ============================================================================
create or replace function public.upsert_recruit_form(
  p_kind text,
  p_title text,
  p_description text default null,
  p_fields jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_kind not in ('gd', 'interview') then
    raise exception 'Invalid form kind';
  end if;
  if p_title is null or btrim(p_title) = '' then
    raise exception 'Form title is required';
  end if;
  if jsonb_typeof(p_fields) <> 'array' then
    raise exception 'Fields must be a JSON array';
  end if;

  -- every save publishes a fresh version (older versions are kept for audit)
  update public.recruit_form_templates
  set is_active = false
  where kind = p_kind and is_active;

  insert into public.recruit_form_templates (kind, title, description, fields, is_active, created_by)
  values (p_kind, btrim(p_title), p_description, p_fields, true, auth.uid())
  returning id into v_id;

  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'Recruit Form Saved', 'recruit_form', v_id::text,
          jsonb_build_object('kind', p_kind, 'title', p_title));

  return v_id;
end;
$$;

grant execute on function public.upsert_recruit_form(text, text, text, jsonb) to authenticated;

-- ============================================================================
-- 9) RPC: CIIE member fills the GD or Interview form
-- ============================================================================
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
  else
    if v_app.stage <> 'interview' or v_app.gd_submitted_at is null then
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
    set stage = 'final', interview_submitted_at = now(), interview_form_id = v_form_id, updated_at = now()
    where id = p_application_id;
  end if;

  insert into public.recruit_evaluations (application_id, kind, evaluator_id, responses, remarks)
  values (p_application_id, p_kind, auth.uid(), coalesce(p_responses, '{}'::jsonb), p_remarks)
  on conflict (application_id, kind)
  do update set
    responses = excluded.responses,
    remarks = excluded.remarks,
    evaluator_id = excluded.evaluator_id,
    submitted_at = now()
  returning id into v_eval_id;

  return v_eval_id;
end;
$$;

grant execute on function public.submit_recruit_evaluation(uuid, text, jsonb, text) to authenticated;

-- ============================================================================
-- 10) MAIL HELPER — supports both the modern pg_smtp_client API and the
--     legacy net.smtp_send() (if the older extension version is installed).
-- ============================================================================
-- Internal helper — no direct EXECUTE grant; only the definer functions above
-- (select_recruit / send_test_email) call it, so it cannot be abused.
create or replace function public.recruit_send_mail(
  p_to text,
  p_from text,
  p_subject text,
  p_html text,
  p_plain text,
  p_host text,
  p_port integer,
  p_user text,
  p_pass text
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_result text;
  v_raw text;
begin
  if exists (
    select 1
    from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
    where ns.nspname = 'smtp_client' and pr.proname = 'send_email'
  ) then
    execute format(
      'select smtp_client.send_email(%L, %L, true, %L, array[%L], null, null, %L, %s, true, %L, %L)',
      p_subject, p_html, p_from, p_to, p_host, p_port, p_user, p_pass
    ) into v_result;
  elsif exists (
    select 1
    from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
    where ns.nspname = 'net' and pr.proname = 'smtp_send'
  ) then
    v_raw := 'From: ' || p_from || E'\n'
          || 'To: ' || p_to || E'\n'
          || 'Subject: ' || p_subject || E'\n'
          || 'MIME-Version: 1.0' || E'\n'
          || 'Content-Type: text/html; charset=UTF-8' || E'\n'
          || E'\n' || p_html;
    execute format(
      'select net.smtp_send(%L, %s, true, %L, %L, %L, %L, %L)',
      p_host, p_port, p_user, p_pass, p_to, p_from, v_raw
    ) into v_result;
  else
    raise exception 'SMTP extension (pg_smtp_client) is not installed. Run: create extension if not exists pg_smtp_client;';
  end if;

  return v_result;
end;
$$;

-- (no grant on recruit_send_mail — internal only)

-- ============================================================================
-- 11) RPC: approve a recruit in Final Selection (sends the congratulation mail)
-- ============================================================================
create or replace function public.select_recruit(
  p_application_id uuid,
  p_message text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_app public.recruit_applications%rowtype;
  v_profile public.profiles%rowtype;
  v_smtp record;
  v_subject text;
  v_plain text;
  v_html text;
  v_email_id uuid;
  v_err text;
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

  select * into v_profile from public.profiles where id = v_app.member_id;
  if v_profile.email is null then
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

  v_subject := 'Congratulations ' || coalesce(v_profile.full_name, '') || ' — you are selected to join KL CIIE!';
  v_plain := 'Dear ' || coalesce(v_profile.full_name, '') || E'\n\n'
          || 'Congratulations! On behalf of KL CIIE we are delighted to welcome you as an official member of the KL CIIE team.' || E'\n\n'
          || 'Message from the selection team:' || E'\n'
          || btrim(p_message) || E'\n\n'
          || 'We look forward to working with you.' || E'\n\n'
          || 'Regards,' || E'\n' || 'KL CIIE';
  v_html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">'
         || '<div style="background:#4f46e5;padding:22px 28px;text-align:center">'
         || '<span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:1px">KL CIIE</span></div>'
         || '<div style="padding:28px;color:#0f172a;font-size:15px;line-height:1.6">'
         || '<h2 style="margin:0 0 14px;color:#0f172a">Congratulations ' || coalesce(v_profile.full_name, '') || '!</h2>'
         || '<p style="margin:0 0 12px">On behalf of <strong>KL CIIE</strong>, we are delighted to welcome you as an official member of the KL CIIE team.</p>'
         || '<p style="margin:0 0 8px"><strong>Message from the selection team:</strong></p>'
         || '<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:4px solid #4f46e5;background:#eef2ff;border-radius:6px;color:#1e293b">'
         || replace(btrim(p_message), E'\n', '<br/>') || '</blockquote>'
         || '<p style="margin:0 0 20px">We look forward to working with you this year.</p>'
         || '<p style="margin:0">Regards,<br/><strong>KL CIIE</strong></p>'
         || '</div></div>';

  begin
    select * into v_smtp from public.recruit_smtp_settings where id = 1;
    if v_smtp.email is null or v_smtp.password is null then
      raise exception 'SMTP is not configured. Ask an admin to add it under Admin > SMTP.';
    end if;
    perform public.recruit_send_mail(
      v_profile.email,
      v_smtp.email,
      v_subject,
      v_html,
      v_plain,
      coalesce(v_smtp.host, 'smtp.gmail.com'),
      coalesce(v_smtp.port, 587),
      v_smtp.email,
      v_smtp.password
    );
    insert into public.recruit_emails (application_id, to_email, subject, body, status, sent_by)
    values (p_application_id, v_profile.email, v_subject, v_html, 'sent', auth.uid())
    returning id into v_email_id;
  exception when others then
    v_err := sqlerrm;
    insert into public.recruit_emails (application_id, to_email, subject, body, status, error, sent_by)
    values (p_application_id, v_profile.email, v_subject, v_html, 'failed', left(v_err, 2000), auth.uid());
  end;

  return p_application_id;
end;
$$;

grant execute on function public.select_recruit(uuid, text) to authenticated;

-- ============================================================================
-- 12) REJECT-ALL PERMISSION WORKFLOW
-- ============================================================================
create or replace function public.request_reject_all(p_reason text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (public.is_admin() or public.is_ciie_member()) then
    raise exception 'Not authorized';
  end if;
  if exists (
    select 1 from public.recruit_reject_requests
    where requested_by = auth.uid() and status in ('pending', 'approved')
  ) then
    raise exception 'You already have a pending or approved reject-all request';
  end if;
  insert into public.recruit_reject_requests (requested_by, reason)
  values (auth.uid(), p_reason)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.request_reject_all(text) to authenticated;

create or replace function public.decide_reject_request(p_request_id uuid, p_approved boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  update public.recruit_reject_requests
  set status = case when p_approved then 'approved' else 'denied' end,
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request_id and status = 'pending'
  returning * into v_row;
  if not found then
    raise exception 'Request not found or already decided';
  end if;
  insert into public.admin_audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), case when p_approved then 'Reject-All Approved' else 'Reject-All Denied' end,
          'recruit_reject', p_request_id::text,
          jsonb_build_object('requested_by', v_row.requested_by));
end;
$$;

grant execute on function public.decide_reject_request(uuid, boolean) to authenticated;

create or replace function public.execute_reject_all(p_request_id uuid)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.recruit_reject_requests%rowtype;
  v_count bigint;
begin
  select * into v_row from public.recruit_reject_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_row.status <> 'approved' then
    raise exception 'This reject-all request has not been approved by an admin';
  end if;
  if not (public.is_admin() or v_row.requested_by = auth.uid()) then
    raise exception 'Not authorized';
  end if;

  update public.recruit_applications
  set stage = 'rejected',
      final_decision = 'rejected',
      decided_by = auth.uid(),
      decided_at = now(),
      updated_at = now()
  where stage = 'final' and final_decision is null;

  get diagnostics v_count = row_count;

  update public.recruit_reject_requests
  set status = 'used', used_at = now()
  where id = p_request_id;

  return v_count;
end;
$$;

grant execute on function public.execute_reject_all(uuid) to authenticated;

-- ============================================================================
-- 13) SMTP CONFIG RPCs (never expose the password through RLS)
-- ============================================================================
create or replace function public.get_smtp_status()
returns table (email text, host text, port integer, configured boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  return query
    select s.email, s.host, s.port,
           (s.email is not null and s.password is not null),
           s.updated_at
    from public.recruit_smtp_settings s
    where s.id = 1;
end;
$$;

grant execute on function public.get_smtp_status() to authenticated;

create or replace function public.save_smtp_settings(
  p_email text default null,
  p_password text default null,
  p_host text default 'smtp.gmail.com',
  p_port integer default 587
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;
  if p_host is null or btrim(p_host) = '' then
    raise exception 'SMTP host is required';
  end if;
  if p_port is null or p_port < 1 or p_port > 65535 then
    raise exception 'Invalid SMTP port';
  end if;
  update public.recruit_smtp_settings
  set email = nullif(btrim(coalesce(p_email, '')), ''),
      password = case when p_password is null or btrim(p_password) = '' then password else p_password end,
      host = btrim(p_host),
      port = p_port,
      updated_by = auth.uid(),
      updated_at = now()
  where id = 1;
end;
$$;

grant execute on function public.save_smtp_settings(text, text, text, integer) to authenticated;

create or replace function public.send_test_email(p_to text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_smtp record;
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if p_to is null or btrim(p_to) = '' then
    raise exception 'Recipient email is required';
  end if;
  select * into v_smtp from public.recruit_smtp_settings where id = 1;
  if v_smtp.email is null or v_smtp.password is null then
    raise exception 'Save the SMTP credentials first';
  end if;
  perform public.recruit_send_mail(
    btrim(p_to),
    v_smtp.email,
    'KL CIIE — SMTP test email',
    '<div style="font-family:Arial,sans-serif;padding:24px;color:#0f172a"><h3>SMTP test</h3><p>Your Gmail SMTP settings work correctly.</p><p>Regards,<br/><strong>KL CIIE</strong></p></div>',
    'SMTP test — your Gmail SMTP settings work correctly.',
    v_smtp.host,
    v_smtp.port,
    v_smtp.email,
    v_smtp.password
  );
  return 'Sent';
exception when others then
  return 'Failed: ' || sqlerrm;
end;
$$;

grant execute on function public.send_test_email(text) to authenticated;

-- ============================================================================
-- 14) RPC: the whole pipeline for CIIE members / admins (RLS prevents them
--     from reading applicant profiles directly, so this is a definer function).
-- ============================================================================
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
      p.full_name,
      p.ciie_id,
      p.student_id,
      p.email,
      p.phone,
      p.department,
      p.year_of_study,
      p.interview_batch,
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

-- ============================================================================
-- 15) ROW LEVEL SECURITY
-- ============================================================================
alter table public.recruit_smtp_settings enable row level security;
alter table public.recruit_form_templates enable row level security;
alter table public.recruit_applications enable row level security;
alter table public.recruit_evaluations enable row level security;
alter table public.recruit_reject_requests enable row level security;
alter table public.recruit_emails enable row level security;

-- recruit_smtp_settings: super admin only (contains the app password)
drop policy if exists recruit_smtp_read on public.recruit_smtp_settings;
create policy recruit_smtp_read on public.recruit_smtp_settings
  for select to authenticated using (public.is_super_admin());

drop policy if exists recruit_smtp_write on public.recruit_smtp_settings;
create policy recruit_smtp_write on public.recruit_smtp_settings
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- recruit_form_templates: everyone authenticated can read (needed to render
-- the GD / Interview forms); only admins write.
drop policy if exists recruit_templates_read on public.recruit_form_templates;
create policy recruit_templates_read on public.recruit_form_templates
  for select to authenticated using (true);

drop policy if exists recruit_templates_admin_write on public.recruit_form_templates;
create policy recruit_templates_admin_write on public.recruit_form_templates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- recruit_applications: admins, CIIE members, and the applicant themselves.
drop policy if exists recruit_applications_read on public.recruit_applications;
create policy recruit_applications_read on public.recruit_applications
  for select to authenticated
  using (public.is_admin() or public.is_ciie_member() or member_id = auth.uid());

-- recruit_evaluations: admins, CIIE members, and the applicant themselves.
drop policy if exists recruit_evaluations_read on public.recruit_evaluations;
create policy recruit_evaluations_read on public.recruit_evaluations
  for select to authenticated
  using (
    public.is_admin()
    or public.is_ciie_member()
    or exists (
      select 1 from public.recruit_applications a
      where a.id = application_id and a.member_id = auth.uid()
    )
  );

-- recruit_reject_requests: admins read all, requesters read their own.
drop policy if exists recruit_reject_requests_read on public.recruit_reject_requests;
create policy recruit_reject_requests_read on public.recruit_reject_requests
  for select to authenticated
  using (public.is_admin() or requested_by = auth.uid());

-- recruit_emails: admins only.
drop policy if exists recruit_emails_read on public.recruit_emails;
create policy recruit_emails_read on public.recruit_emails
  for select to authenticated using (public.is_admin());

-- ============================================================================
-- 16) REALTIME: push stage changes to the live GD / Interview / Final pages
-- ============================================================================
alter table public.recruit_applications replica identity full;
alter table public.recruit_evaluations replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'recruit_applications'
  ) then
    alter publication supabase_realtime add table public.recruit_applications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'recruit_evaluations'
  ) then
    alter publication supabase_realtime add table public.recruit_evaluations;
  end if;
end
$$;
