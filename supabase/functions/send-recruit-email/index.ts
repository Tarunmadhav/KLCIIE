// ============================================================================
// KL CIIE — send-recruit-email
//
// Sends recruitment emails through a real SMTP server (e.g. Gmail). SMTP
// credentials are NOT stored in the database or the client bundle — they live
// in the Edge Function secrets:
//
//   npx supabase secrets set --env-file .env
//
// with SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM in that file
// (plain env names, no VITE_ prefix — Vite never exposes them to the browser).
//
// Two kinds of email:
//   * kind = 'join-verification' — the anonymous "Join CIIE" flow. No JWT is
//     required. The function loads the pending join_application by id
//     (service role), generates the 6-digit code, stores its SHA-256 hash, and
//     emails the code to the applicant's stored address. The code is never
//     returned to the client.
//   * default (congratulations / SMTP tests) — only authenticated users. The
//     payload is the { to_email, subject, text, html } object returned by the
//     select_recruit RPC.
//
// Every send is recorded in public.recruit_emails (service role, bypasses RLS).
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
  kind?: "join-verification"
  application_id?: string | null
  to_email?: string
  subject?: string
  text?: string
  html?: string
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
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

  let payload: EmailPayload
  try {
    payload = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders })
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })

  if (payload.kind === "join-verification") {
    if (!payload.application_id) {
      return Response.json({ error: "Missing application_id" }, { status: 400, headers: corsHeaders })
    }
    const { data: app, error: loadErr } = await admin
      .from("join_applications")
      .select("id, email, full_name, status")
      .eq("id", payload.application_id)
      .maybeSingle()
    if (loadErr || !app || app.status !== "pending") {
      return Response.json(
        { error: "Application not found or already submitted. Please apply again." },
        { status: 400, headers: corsHeaders },
      )
    }

    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")
    const hash = await sha256Hex(code)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    await admin.from("join_applications").update({ code_hash: hash, code_expires_at: expiresAt, code_attempts: 0 }).eq("id", app.id)

    const subject = `Verify your KL CIIE application — code ${code}`
    const text = `Hi ${app.full_name}\n\n`
      + "Enter this code on the KL CIIE website to confirm your application:\n\n"
      + `  ${code}\n\n`
      + "The code expires in 15 minutes.\n\n"
      + "If you did not apply to KL CIIE, you can ignore this email.\n\n"
      + "Regards,\nKL CIIE"
    const safeName = (app.full_name ?? "").replace(/[\n\r]/g, " ").trim() || "student"
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">`
      + `<div style="background:#4f46e5;padding:20px 26px;text-align:center">`
      + `<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px">KL CIIE</span></div>`
      + `<div style="padding:26px;color:#0f172a;font-size:15px;line-height:1.6">`
      + `<h2 style="margin:0 0 12px;color:#0f172a">Hi ${safeName},</h2>`
      + `<p style="margin:0 0 14px">Enter this code on the KL CIIE website to confirm your application:</p>`
      + `<div style="margin:0 0 14px;padding:14px 0;text-align:center;background:#eef2ff;border-radius:8px;font-size:28px;font-weight:800;letter-spacing:8px;color:#4f46e5">${code}</div>`
      + `<p style="margin:0 0 14px">The code expires in <strong>15 minutes</strong>.</p>`
      + `<p style="margin:0 0 14px">If you did not apply to KL CIIE, you can ignore this email.</p>`
      + `<p style="margin:0">Regards,<br/><strong>KL CIIE</strong></p>`
      + `</div></div>`

    try {
      const info = await transport.sendMail({ from, to: app.email, subject, text, html })
      await admin.from("recruit_emails").insert({
        application_id: null,
        to_email: app.email,
        subject,
        body: html,
        status: "sent",
        sent_by: null,
      })
      return Response.json({ ok: true, messageId: info.messageId }, { headers: corsHeaders })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await admin.from("recruit_emails").insert({
        application_id: null,
        to_email: app.email,
        subject,
        body: html,
        status: "failed",
        error: message.slice(0, 2000),
        sent_by: null,
      })
      return Response.json({ error: message }, { status: 500, headers: corsHeaders })
    }
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

  const to = payload.to_email
  if (!to) {
    return Response.json({ error: "Missing recipient (to_email)" }, { status: 400, headers: corsHeaders })
  }

  const subject = payload.subject ?? "KL CIIE"
  const text = payload.text ?? ""
  const html = payload.html ?? text

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
