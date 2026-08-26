// ============================================================================
// KL CIIE — bulk-delete-members
//
// Admin "Bulk Delete Members" flow. The caller (super_admin / main_admin)
// posts a list of email addresses extracted from an uploaded Excel sheet:
//     { emails: ["user1@example.com", "user2@example.com", ...] }
//
// For every email this function:
//   1. Looks up the profile by email (case-insensitive).
//   2. Skips if no profile found (reports as "not found").
//   3. Skips if the target is a super_admin or main_admin (protection).
//   4. Deletes the auth user via the GoTrue admin API (cascades to profiles
//      via the on_auth_user_deleted trigger or FK cascade).
//   5. Reports success/failure per email.
//
// The function is gated to super_admin / main_admin only.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ALLOWED_ROLES = ["super_admin", "main_admin"]
const PROTECTED_ROLES = ["super_admin", "main_admin"]
const MAX_BATCH = 500

interface DeleteResult {
  email: string
  ok: boolean
  error?: string
  user_id?: string
}

Deno.serve(async (req: Request): Promise<Response> => {
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

  // Caller must be an authenticated, active super_admin / main_admin.
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

  // Parse payload
  let body: { emails?: string[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders })
  }

  const emails = Array.isArray(body.emails)
    ? body.emails.map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => e.length > 0)
    : []
  if (emails.length === 0) {
    return Response.json({ error: "No emails provided" }, { status: 400, headers: corsHeaders })
  }
  if (emails.length > MAX_BATCH) {
    return Response.json(
      { error: `Send at most ${MAX_BATCH} emails per request` },
      { status: 400, headers: corsHeaders },
    )
  }

  // Deduplicate
  const uniqueEmails = [...new Set(emails)]

  // Look up all matching profiles in one query
  const { data: profiles, error: lookupErr } = await admin
    .from("profiles")
    .select("id, email, role, full_name")
    .in("email", uniqueEmails)

  if (lookupErr) {
    return Response.json({ error: `Lookup failed: ${lookupErr.message}` }, { status: 500, headers: corsHeaders })
  }

  const profileMap = new Map<string, { id: string; email: string; role: string; full_name: string | null }>()
  for (const p of profiles ?? []) {
    if (p.email) profileMap.set(String(p.email).trim().toLowerCase(), p as { id: string; email: string; role: string; full_name: string | null })
  }

  const results: DeleteResult[] = []

  for (const email of uniqueEmails) {
    const profile = profileMap.get(email)
    if (!profile) {
      results.push({ email, ok: false, error: "No account found with this email." })
      continue
    }
    if (PROTECTED_ROLES.includes(profile.role)) {
      results.push({ email, ok: false, error: `Cannot delete a ${profile.role} account.` })
      continue
    }

    try {
      const { error: delErr } = await admin.auth.admin.deleteUser(profile.id)
      if (delErr) {
        results.push({ email, ok: false, error: delErr.message, user_id: profile.id })
      } else {
        results.push({ email, ok: true, user_id: profile.id })
      }
    } catch (e) {
      results.push({ email, ok: false, error: e instanceof Error ? e.message : String(e) })
    }

    // Safety net: explicitly remove the profile row in case the FK cascade
    // from auth.users did not fire (GoTrue admin API sometimes skips it).
    // Mirrors the behaviour of the admin_delete_user RPC.
    await admin.from("profiles").delete().eq("id", profile.id)
  }

  const deletedCount = results.filter((r) => r.ok).length
  const failedCount = results.filter((r) => !r.ok).length

  await admin.from("admin_audit_logs").insert({
    actor_id: caller.id,
    action: "Bulk Members Deleted",
    entity_type: "bulk_delete",
    entity_id: null,
    details: {
      requested: uniqueEmails.length,
      deleted: deletedCount,
      failed: failedCount,
    },
  })

  return Response.json(
    { results, total: uniqueEmails.length, deleted: deletedCount, failed: failedCount },
    { headers: corsHeaders },
  )
}
