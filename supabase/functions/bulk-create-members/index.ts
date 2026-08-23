// ============================================================================
// KL CIIE — bulk-create-members
//
// Admin "Bulk Add Members" flow. The caller (super_admin / main_admin) posts a
// validated list of members from the uploaded Excel sheet:
//     { members: [{ full_name, email, student_id, department?, year_of_study?,
//                   phone? }], role? }
//
// `role` (optional, default "user") is applied to EVERY account in the batch.
// Importable roles: user | member | member_ciie | faculty. Admin roles are
// never accepted here.
// For every member this function:
//   1. Re-validates the row server-side: name required, valid email,
//      Student ID exactly 10 digits, Phone exactly 10 digits.
//   2. Rejects duplicates inside the batch and against existing accounts
//      (same email or same Student ID already in public.profiles).
//   3. Generates a strong random password and creates the auth account via
//      the GoTrue admin API (email pre-confirmed). The on_auth_user_created
//      trigger auto-creates the profile + QR code + privacy settings.
//   4. Activates the new profile (status 'active', role 'user', clears
//      interview batch) and stores student_id / phone / department /
//      year_of_study. Role 'user' = regular account: can register for events
//      and use QR attendance, without full CIIE-member perks (points,
//      leaderboard, directory).
//
// The plaintext passwords are returned ONCE in the response so the admin UI
// can show them and email them through send-recruit-email. They are not
// stored anywhere in plain text afterwards.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface BulkMember {
  client_index?: number
  full_name?: string
  email?: string
  student_id?: string
  department?: string | null
  year_of_study?: string | null
  phone?: string
}

interface MemberResult {
  index: number
  client_index: number | null
  ok: boolean
  full_name: string
  email: string
  student_id: string
  password?: string
  user_id?: string
  error?: string
}

interface Prepared {
  index: number
  clientIndex: number | null
  fullName: string
  email: string
  studentId: string
  phone: string
  department: string
  yearOfStudy: string
}

type AdminClient = ReturnType<typeof createClient>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALLOWED_ROLES = ["super_admin", "main_admin"]
const IMPORTABLE_ROLES = ["user", "member", "member_ciie", "faculty"]
const MAX_BATCH = 200

function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "")
}

/** Unambiguous password: no 0/O/1/l/I, always upper+lower+digit, 12 chars. */
function generatePassword(): string {
  const lower = "abcdefghijkmnopqrstuvwxyz"
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const digits = "23456789"
  const all = lower + upper + digits

  const pick = (chars: string): string => {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return chars[buf[0] % chars.length]!
  }
  const randInt = (max: number): number => {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0] % max
  }

  const out = [pick(lower), pick(upper), pick(digits)]
  for (let i = out.length; i < 12; i++) out.push(pick(all))
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out.join("")
}

// Create one account + activate its profile. Throws only on unexpected
// failures; expected ones (duplicate email, etc.) are reported as results.
async function createOne(
  admin: AdminClient,
  m: Prepared,
  batchRole: string,
  results: MemberResult[],
): Promise<void> {
  const password = generatePassword()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: m.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: m.fullName,
      phone: m.phone,
      department: m.department,
      year_of_study: m.yearOfStudy,
      role: batchRole,
    },
  })

  if (createErr || !created?.user) {
    results.push({
      index: m.index,
      client_index: m.clientIndex,
      ok: false,
      full_name: m.fullName,
      email: m.email,
      student_id: m.studentId,
      error: createErr?.message ?? "Account could not be created.",
    })
    return
  }

  // The signup trigger already created the profile as a pending member;
  // activate it and fill in the Excel data.
  const { error: updateErr } = await admin
    .from("profiles")
    .update({
      status: "active",
      role: batchRole,
      interview_batch: null,
      student_id: m.studentId,
      phone: m.phone,
      department: m.department || null,
      year_of_study: m.yearOfStudy || null,
    })
    .eq("id", created.user.id)

  results.push({
    index: m.index,
    client_index: m.clientIndex,
    ok: !updateErr,
    full_name: m.fullName,
    email: m.email,
    student_id: m.studentId,
    password,
    user_id: created.user.id,
    error: updateErr ? `Account created but activation failed: ${updateErr.message}` : undefined,
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight first, then guarantee that EVERY response — including unexpected
  // crashes — carries CORS headers. A bare gateway/runtime error without CORS
  // makes browsers block the request entirely ("Failed to send a request…").
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  try {
    return await handleRequest(req)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return Response.json({ error: `Function crashed: ${message}` }, { status: 500, headers: corsHeaders })
  }
})

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders })
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )

  // ------------------------------------------------------------------
  // Caller must be an authenticated, active super_admin / main_admin.
  // ------------------------------------------------------------------
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  )
  const {
    data: { user: caller },
  } = await authClient.auth.getUser()
  if (!caller) {
    return Response.json({ error: "Not authorized" }, { status: 401, headers: corsHeaders })
  }
  const { data: adminProfile } = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", caller.id)
    .maybeSingle()
  if (
    !adminProfile ||
    adminProfile.status !== "active" ||
    !ALLOWED_ROLES.includes(String(adminProfile.role))
  ) {
    return Response.json({ error: "Forbidden — super admins only." }, { status: 403, headers: corsHeaders })
  }

  // ------------------------------------------------------------------
  // Parse + validate payload
  // ------------------------------------------------------------------
  let body: { members?: BulkMember[]; role?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders })
  }

  // Optional batch-wide role (default "user"). Admin roles are rejected.
  let batchRole = "user"
  if (body.role !== undefined && body.role !== null) {
    if (typeof body.role !== "string" || !IMPORTABLE_ROLES.includes(body.role)) {
      return Response.json(
        { error: `Invalid role. Allowed: ${IMPORTABLE_ROLES.join(", ")}.` },
        { status: 400, headers: corsHeaders },
      )
    }
    batchRole = body.role
  }

  const members = Array.isArray(body.members) ? body.members : []
  if (members.length === 0) {
    return Response.json({ error: "No members provided" }, { status: 400, headers: corsHeaders })
  }
  if (members.length > MAX_BATCH) {
    return Response.json(
      { error: `Send at most ${MAX_BATCH} members per request` },
      { status: 400, headers: corsHeaders },
    )
  }

  // Existing accounts for duplicate checks (club scale — one read is fine).
  const seenEmails = new Map<string, string>()
  const seenStudentIds = new Map<string, string>()
  {
    let from = 0
    for (;;) {
      const { data, error } = await admin
        .from("profiles")
        .select("email, student_id, full_name")
        .range(from, from + 4999)
      if (error) break
      const rows = data ?? []
      for (const r of rows) {
        if (r.email) seenEmails.set(String(r.email).trim().toLowerCase(), String(r.full_name ?? "an existing account"))
        if (r.student_id) seenStudentIds.set(digitsOnly(r.student_id), String(r.full_name ?? "an existing account"))
      }
      if (rows.length < 5000) break
      from += 5000
    }
  }

  const prepared: Prepared[] = []
  const rejected: MemberResult[] = []

  members.forEach((m, index) => {
    const fullName = String(m.full_name ?? "").replace(/\s+/g, " ").trim()
    const email = String(m.email ?? "").trim().toLowerCase()
    const studentId = digitsOnly(m.student_id)
    const phone = digitsOnly(m.phone)
    const department = String(m.department ?? "").trim()
    const yearOfStudy = String(m.year_of_study ?? "").trim()
    const clientIndex = typeof m.client_index === "number" ? m.client_index : null

    const fail = (error: string) =>
      rejected.push({
        index,
        client_index: clientIndex,
        ok: false,
        full_name: fullName || "(no name)",
        email,
        student_id: studentId,
        error,
      })

    if (!fullName) return fail("Name is missing.")
    if (!EMAIL_RE.test(email)) return fail("Email is invalid.")
    if (studentId.length !== 10) return fail(`Student ID must be exactly 10 digits (got ${studentId.length || "none"}).`)
    if (phone.length !== 10) return fail(`Phone number must be exactly 10 digits (got ${phone.length || "none"}).`)

    if (prepared.some((p) => p.email === email)) return fail("Duplicate email within the uploaded sheet.")
    if (prepared.some((p) => p.studentId === studentId)) return fail("Duplicate Student ID within the uploaded sheet.")
    if (seenEmails.has(email))
      return fail(`An account with this email already exists (${seenEmails.get(email)}).`)
    if (seenStudentIds.has(studentId))
      return fail(`A member with this Student ID already exists (${seenStudentIds.get(studentId)}).`)

    seenEmails.set(email, fullName)
    seenStudentIds.set(studentId, fullName)
    prepared.push({ index, clientIndex, fullName, email, studentId, phone, department, yearOfStudy })
  })

  // ------------------------------------------------------------------
  // Create the accounts sequentially (GoTrue admin API + profile update)
  // ------------------------------------------------------------------
  const results: MemberResult[] = []
  for (const m of prepared) {
    try {
      await createOne(admin, m, batchRole, results)
    } catch (e) {
      results.push({
        index: m.index,
        client_index: m.clientIndex,
        ok: false,
        full_name: m.fullName,
        email: m.email,
        student_id: m.studentId,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  await admin.from("admin_audit_logs").insert({
    actor_id: caller.id,
    action: "Bulk Members Created",
    entity_type: "bulk_import",
    entity_id: null,
    details: {
      requested: members.length,
      created: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length + rejected.length,
      role: batchRole,
    },
  })

  return Response.json(
    { results: [...rejected, ...results], total: members.length },
    { headers: corsHeaders },
  )
}
