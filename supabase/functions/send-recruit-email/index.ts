// ============================================================================
// KL CIIE — send-recruit-email
//
// Sends recruitment emails (congratulations to selected applicants, SMTP tests)
// through a real SMTP server (e.g. Gmail). SMTP credentials are NOT stored in
// the database or the client bundle — they live in the Edge Function secrets:
//
//   npx supabase secrets set --env-file .env
//
// with SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM in that file
// (plain env names, no VITE_ prefix — Vite never exposes them to the browser).
//
// The function only accepts calls from authenticated users (the JWT in the
// Authorization header is verified against Supabase Auth), then sends the mail
// and records the outcome in public.recruit_emails.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer@6.9.16"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface EmailPayload {
  to_email?: string
  subject?: string
  text?: string
  html?: string
  application_id?: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders })
  }

  const host = Deno.env.get("SMTP_HOST")
  const port = Number(Deno.env.get("SMTP_PORT") ?? 465)
  const user = Deno.env.get("SMTP_USER")
  const pass = Deno.env.get("SMTP_PASS")
  const from = Deno.env.get("SMTP_FROM")
  if (!host || !user || !pass || !from) {
    return Response.json(
      {
        error:
          "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM via `supabase secrets set --env-file .env`.",
      },
      { status: 500, headers: corsHeaders },
    )
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  )
  const {
    data: { user: caller },
  } = await supabase.auth.getUser()
  if (!caller) {
    return Response.json({ error: "Not authorized" }, { status: 401, headers: corsHeaders })
  }

  let payload: EmailPayload
  try {
    payload = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders })
  }
  const to = payload.to_email
  if (!to) {
    return Response.json({ error: "Missing recipient (to_email)" }, { status: 400, headers: corsHeaders })
  }

  const subject = payload.subject ?? "KL CIIE"
  const text = payload.text ?? ""
  const html = payload.html ?? text

  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")

  try {
    const info = await transport.sendMail({ from, to, subject, text, html })
    await admin.from("recruit_emails").insert({
      application_id: payload.application_id ?? null,
      to_email: to,
      subject,
      body: html,
      status: "sent",
      sent_by: caller.id,
    })
    return Response.json({ ok: true, messageId: info.messageId }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin.from("recruit_emails").insert({
      application_id: payload.application_id ?? null,
      to_email: to,
      subject,
      body: html,
      status: "failed",
      error: message.slice(0, 2000),
      sent_by: caller.id,
    })
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})
