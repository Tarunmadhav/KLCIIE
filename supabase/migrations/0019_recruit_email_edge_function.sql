-- ============================================================================
-- KL CIIE Platform V2 — 0019: recruitment emails moved to an Edge Function
--
-- pg_smtp_client is not available on Supabase's managed Postgres, so email is
-- now sent from the `send-recruit-email` Edge Function, which reads SMTP
-- credentials from environment secrets (set via `supabase secrets set`).
--
-- This migration:
--   1) Drops the obsolete in-database SMTP plumbing from 0018.
--   2) Reworks select_recruit: it only marks the recruit as selected and
--      RETURNS the prepared email payload (jsonb). The frontend then invokes
--      the Edge Function, which sends the mail and records the outcome in
--      public.recruit_emails (inserted with the service-role key, bypassing RLS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) REMOVE OBSOLETE SMTP PLUMBING
-- ---------------------------------------------------------------------------
drop function if exists public.recruit_send_mail(text, text, text, text, text, text, integer, text, text);
drop function if exists public.get_smtp_status();
drop function if exists public.save_smtp_settings(text, text, text, integer);
drop function if exists public.send_test_email(text);
drop table if exists public.recruit_smtp_settings;

-- ---------------------------------------------------------------------------
-- 2) SELECT RECRUIT — mark selected and return the email payload (no sending)
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

  return jsonb_build_object(
    'application_id', p_application_id,
    'to_email', v_profile.email,
    'full_name', v_profile.full_name,
    'subject', v_subject,
    'text', v_plain,
    'html', v_html
  );
end;
$$;

grant execute on function public.select_recruit(uuid, text) to authenticated;
