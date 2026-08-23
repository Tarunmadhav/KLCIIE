// ============================================================================
// KL CIIE — send-recruit-email
//
// Sends emails through a pool of up to 10 Gmail SMTP accounts managed by the
// Super Admin in the Admin panel (/admin/smtp). The credentials live in the
// public.smtp_settings table (super-admin MFA-gated), NOT in env secrets.
//
// Round-robin rotation: sends do NOT all go out through account #1. Every send
// starts at the next active account in the pool (1st mail -> 1st account,
// 2nd mail -> 2nd account, ... looping back after the last), tracked by a
// global counter in public.smtp_rotation_state, so bulk mailings spread load
// evenly across all configured Gmail accounts. Failover still applies within
// one send: if the chosen account fails, the remaining accounts are tried in
// rotated order and the user only sees an error when every account failed.
// If 1 or 2 accounts are configured, only those are used. When no accounts
// are configured the function falls back to SMTP_HOST / SMTP_USER / SMTP_PASS /
// SMTP_FROM env secrets (legacy, e.g. `npx supabase secrets set --env-file .env`).
//
// Kinds:
//   * kind = 'join-verification' — the anonymous "Join CIIE" flow. No JWT is
//     required. Loads the pending join_application by id (service role),
//     generates the 6-digit code, stores its SHA-256 hash, and emails the code
//     to the applicant's stored address. The code is never returned.
//   * kind = 'registration-otp' — email verification for role registration
//     (/register/:slug). Payload: { purpose, to_email, full_name }. Generates
//     the code, stores its hash in email_otp_codes and emails it.
//   * default (congratulations / SMTP tests / ad-hoc) — authenticated users
//     only. Payload: { to_email, subject, text, html, smtp_id? }.
//
// Every attempt is recorded in public.recruit_emails (service role, bypasses
// RLS) including which SMTP account was used.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer@6.9.16"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface SmtpAccount {
  id: string
  email: string
  password: string
  from_name: string
  host: string
  port: number
}

interface EmailPayload {
  kind?: "join-verification" | "registration-otp"
  application_id?: string | null
  purpose?: string | null
  to_email?: string
  full_name?: string
  subject?: string
  text?: string
  html?: string
  smtp_id?: string | null
}

interface SendOptions {
  to: string
  subject: string
  text: string
  html: string
  applicationId?: string | null
  sentBy?: string | null
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

// The Supabase Admin API does not provide a getUserByEmail method in every
// supabase-js version supported by Edge Functions, so search the paginated
// admin user list instead.
async function findAuthUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ found: boolean; error: string | null }> {
  const perPage = 1000
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) return { found: false, error: error.message }
    if (data.users.some((user) => (user.email ?? "").toLowerCase() === email)) {
      return { found: true, error: null }
    }
    if (data.users.length < perPage) return { found: false, error: null }
  }
}

function random6(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")
}

// Load active SMTP accounts from the database (service role), ordered for
// failover. Falls back to legacy env secrets when nothing is configured.
async function loadSmtpAccounts(admin: ReturnType<typeof createClient>): Promise<SmtpAccount[]> {
  const { data } = await admin
    .from("smtp_settings")
    .select("id, email, password, from_name, host, port")
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(10)

  if (data && data.length > 0) {
    return data.map((r) => ({
      id: String(r.id),
      email: String(r.email),
      password: String(r.password),
      from_name: (r.from_name as string | null) || "KL CIIE",
      host: (r.host as string | null) || "smtp.gmail.com",
      port: Number(r.port) || 465,
    }))
  }

  const host = Deno.env.get("SMTP_HOST")
  const user = Deno.env.get("SMTP_USER")
  const pass = Deno.env.get("SMTP_PASS")
  const from = Deno.env.get("SMTP_FROM")
  if (host && user && pass && from) {
    const match = from.match(/^(.*)<(.+)>\s*$/i)
    return [{
      id: "env",
      email: user,
      password: pass,
      from_name: (match?.[1] ?? "KL CIIE").trim() || "KL CIIE",
      host,
      port: Number(Deno.env.get("SMTP_PORT") ?? 465) || 465,
    }]
  }
  return []
}

async function loadSmtpAccountById(admin: ReturnType<typeof createClient>, id: string): Promise<SmtpAccount | null> {
  const { data } = await admin
    .from("smtp_settings")
    .select("id, email, password, from_name, host, port")
    .eq("id", id)
    .maybeSingle()
  if (!data) return null
  return {
    id: String(data.id),
    email: String(data.email),
    password: String(data.password),
    from_name: (data.from_name as string | null) || "KL CIIE",
    host: (data.host as string | null) || "smtp.gmail.com",
    port: Number(data.port) || 465,
  }
}

// Round-robin over the active pool: read + bump the global counter so each
// send starts at the next account (mail 1 -> account 1, mail 2 -> account 2,
// ... wrapping around). The returned array is the pool reordered to start at
// the chosen account; sendWithFailover then walks it in order, which doubles
// as failover if the first pick errors.
async function rotateAccounts(
  admin: ReturnType<typeof createClient>,
  accounts: SmtpAccount[],
): Promise<SmtpAccount[]> {
  const pool = [...accounts]
  if (pool.length <= 1) return pool

  let start = -1
  try {
    const { data } = await admin
      .from("smtp_rotation_state")
      .select("next_index")
      .eq("id", true)
      .maybeSingle()
    start = Number(data?.next_index ?? 0)
    await admin
      .from("smtp_rotation_state")
      .update({ next_index: start + 1 })
      .eq("id", true)
  } catch {
    // Rotation state is best-effort; without it we keep position order.
    return pool
  }

  const offset = ((start % pool.length) + pool.length) % pool.length
  return [...pool.slice(offset), ...pool.slice(0, offset)]
}

async function sendWithAccount(account: SmtpAccount, opts: SendOptions): Promise<void> {
  const transport = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.port === 465,
    auth: { user: account.email, pass: account.password },
  })
  await transport.sendMail({
    from: `${account.from_name} <${account.email}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  })
}

// Try every configured account in order. Each attempt is logged. Only when ALL
// of them fail do we return ok: false so the caller can surface an error.
async function sendWithFailover(
  admin: ReturnType<typeof createClient>,
  accounts: SmtpAccount[],
  opts: SendOptions,
): Promise<{ ok: true; account: string } | { ok: false; error: string }> {
  if (accounts.length === 0) {
    return {
      ok: false,
      error:
        "No SMTP account is configured. Ask the CIIE admin to add Gmail SMTP accounts in the Admin panel under Email settings.",
    }
  }

  for (const account of accounts) {
    try {
      await sendWithAccount(account, opts)
      await admin.from("recruit_emails").insert({
        application_id: opts.applicationId ?? null,
        to_email: opts.to,
        subject: opts.subject,
        body: opts.html,
        status: "sent",
        smtp_email: account.email,
        sent_by: opts.sentBy ?? null,
      })
      return { ok: true, account: account.email }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await admin.from("recruit_emails").insert({
        application_id: opts.applicationId ?? null,
        to_email: opts.to,
        subject: opts.subject,
        body: opts.html,
        status: "failed",
        error: message.slice(0, 2000),
        smtp_email: account.email,
        sent_by: opts.sentBy ?? null,
      })
    }
  }

  return {
    ok: false,
    error: `We couldn't send the email right now — all ${accounts.length} configured email account(s) failed. Please try again in a few minutes.`,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders })
  }

  let payload: EmailPayload
  try {
    payload = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders })
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")

  // --------------------------------------------------------------------------
  // kind = 'join-verification' | 'registration-otp' — anonymous OTP flows.
  // --------------------------------------------------------------------------
  if (payload.kind === "join-verification" || payload.kind === "registration-otp") {
    let to: string
    let fullName: string
    let purpose: string | null = null

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
      to = String(app.email)
      fullName = String(app.full_name ?? "")
      purpose = "join"
    } else {
      if (!payload.to_email || !payload.purpose) {
        return Response.json(
          { error: "Missing to_email or purpose for registration OTP" },
          { status: 400, headers: corsHeaders },
        )
      }
      to = payload.to_email.trim().toLowerCase()
      fullName = (payload.full_name ?? "").trim()
      purpose = payload.purpose
    }

    // Password reset is only for existing accounts. Check auth.users before
    // creating an OTP or applying the email-send throttle so unknown addresses
    // never receive (or leave behind) a reset code.
    if (purpose === "password-reset") {
      const account = await findAuthUserByEmail(admin, to)
      if (account.error) {
        return Response.json(
          { error: "We couldn't check this account right now. Please try again in a few minutes." },
          { status: 500, headers: corsHeaders },
        )
      }
      if (!account.found) {
        return Response.json(
          { error: "No account has been registered with this email address. Please register and try again." },
          { status: 404, headers: corsHeaders },
        )
      }
    }

    const code = random6()
    const hash = await sha256Hex(code.toUpperCase())
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    // ------------------------------------------------------------------------
    // Resend throttling: 2 min after the previous send, +30s per attempt,
    // and a hard 10-hour lock once 15 codes have been emailed to this address.
    // ------------------------------------------------------------------------
    const { data: throttle } = await admin.rpc("email_send_status", { p_email: to })
    const locked = throttle?.locked === true
    const waitSeconds = Number(throttle?.wait_seconds ?? 0)
    if (locked) {
      return Response.json(
        {
          error:
            "Too many verification attempts for this email. Please try again after 10 hours.",
          locked: true,
          attempts: Number(throttle?.attempts ?? 0),
        },
        { status: 429, headers: corsHeaders },
      )
    }
    if (waitSeconds > 0) {
      return Response.json(
        {
          error:
            waitSeconds >= 60
              ? `Please wait ${Math.floor(waitSeconds / 60)} min ${waitSeconds % 60} sec before requesting another code.`
              : `Please wait ${waitSeconds} sec before requesting another code.`,
          retry_after_seconds: waitSeconds,
          attempts: Number(throttle?.attempts ?? 0),
        },
        { status: 429, headers: corsHeaders },
      )
    }

    // Store the hash BEFORE sending (a failed send leaves a code that was never
    // emailed — harmless, a resend simply mints a fresh one).
    if (payload.kind === "join-verification") {
      await admin.from("join_applications").update({
        code_hash: hash,
        code_expires_at: expiresAt,
        code_attempts: 0,
      }).eq("id", payload.application_id!)
    } else {
      await admin.from("email_otp_codes").insert({
        email: to,
        purpose,
        code_hash: hash,
        expires_at: expiresAt,
      })
    }

    const safeName = fullName.replace(/[\n\r]/g, " ").trim() || "there"
    const subject = payload.kind === "join-verification"
      ? `Verify your KL CIIE application — code ${code}`
      : `Verify your KL CIIE registration — code ${code}`
    const text = `Hi ${safeName}\n\n`
      + "Enter this code on the KL CIIE website to complete your registration:\n\n"
      + `  ${code}\n\n`
      + "The code expires in 15 minutes.\n\n"
      + "If you did not register with KL CIIE, you can ignore this email.\n\n"
      + "Regards,\nKL CIIE"
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">`
      + `<div style="background:#4f46e5;padding:20px 26px;text-align:center">`
      + `<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px">KL CIIE</span></div>`
      + `<div style="padding:26px;color:#0f172a;font-size:15px;line-height:1.6">`
      + `<h2 style="margin:0 0 12px;color:#0f172a">Hi ${safeName},</h2>`
      + `<p style="margin:0 0 14px">Enter this code on the KL CIIE website to complete your registration:</p>`
      + `<div style="margin:0 0 14px;padding:14px 0;text-align:center;background:#eef2ff;border-radius:8px;font-size:28px;font-weight:800;letter-spacing:8px;color:#4f46e5">${code}</div>`
      + `<p style="margin:0 0 14px">The code expires in <strong>15 minutes</strong>.</p>`
      + `<p style="margin:0 0 14px">If you did not register with KL CIIE, you can ignore this email.</p>`
      + `<p style="margin:0">Regards,<br/><strong>KL CIIE</strong></p>`
      + `</div></div>`

    const result = await sendWithFailover(admin, await rotateAccounts(admin, await loadSmtpAccounts(admin)), {
      to,
      subject,
      text,
      html,
      applicationId: null,
      sentBy: null,
    })

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 500, headers: corsHeaders })
    }
    await admin.rpc("email_send_recorded", { p_email: to })
    return Response.json({ ok: true }, { headers: corsHeaders })
  }

  // --------------------------------------------------------------------------
  // default — authenticated users only (recruit congrats, SMTP tests, ad-hoc).
  // --------------------------------------------------------------------------
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

  let accounts: SmtpAccount[]
  if (payload.smtp_id) {
    // Pin a single account (admin "send test" flow) — no failover here so the
    // admin learns exactly whether THIS account works.
    const pinned = await loadSmtpAccountById(admin, payload.smtp_id)
    accounts = pinned ? [pinned] : []
  } else {
    accounts = await rotateAccounts(admin, await loadSmtpAccounts(admin))
  }

  const result = await sendWithFailover(admin, accounts, {
    to,
    subject,
    text,
    html,
    applicationId: payload.application_id ?? null,
    sentBy: caller.id,
  })

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 500, headers: corsHeaders })
  }
  return Response.json({ ok: true, account: result.account }, { headers: corsHeaders })
})
