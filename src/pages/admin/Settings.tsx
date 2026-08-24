import { useEffect, useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import { Button, Field, PageHeader, TextInput, Toggle } from '@/components/ui'
import { FieldListEditor } from '@/components/FieldListEditor'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { supabase } from '@/lib/supabase'
import type { CustomFieldDef } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

export default function Settings() {
  const { isSuperAdmin } = useAuth()
  const current = useSettings()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    allow_public_signup: true,
    signup_domain_restriction: true,
    signup_email_otp: true,
    allow_password_reset: true,
    stop_dynamic_qr: false,
    domains: 'kluniversity.in',
    interview_day_1: '',
    interview_day_2: '',
    facebook_url: '',
    instagram_url: '',
    linkedin_url: '',
    twitter_url: '',
    youtube_url: '',
    contact_email: '',
    contact_phone: '',
    office_address: '',
    register_fields: [] as CustomFieldDef[],
    signup_fields: [] as CustomFieldDef[],
  })

  useEffect(() => {
    setForm({
      allow_public_signup: current.allow_public_signup,
      signup_domain_restriction: current.signup_domain_restriction,
      signup_email_otp: current.signup_email_otp,
      allow_password_reset: current.allow_password_reset,
      stop_dynamic_qr: current.stop_dynamic_qr,
      domains: (current.signup_allowed_domains ?? []).join(', '),
      interview_day_1: current.interview_day_1 ? String(current.interview_day_1).slice(0, 10) : '',
      interview_day_2: current.interview_day_2 ? String(current.interview_day_2).slice(0, 10) : '',
      facebook_url: current.facebook_url ?? '',
      instagram_url: current.instagram_url ?? '',
      linkedin_url: current.linkedin_url ?? '',
      twitter_url: current.twitter_url ?? '',
      youtube_url: current.youtube_url ?? '',
      contact_email: current.contact_email ?? '',
      contact_phone: current.contact_phone ?? '',
      office_address: current.office_address ?? '',
      register_fields: (current.register_fields ?? []) as CustomFieldDef[],
      signup_fields: (current.signup_fields ?? []) as CustomFieldDef[],
    })
  }, [current])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isSuperAdmin) return
    setBusy(true)
    setError('')
    setSaved(false)
    const payload = {
      allow_public_signup: form.allow_public_signup,
      signup_domain_restriction: form.signup_domain_restriction,
      signup_email_otp: form.signup_email_otp,
      allow_password_reset: form.allow_password_reset,
      stop_dynamic_qr: form.stop_dynamic_qr,
      signup_allowed_domains: form.domains
        .split(',')
        .map((d) => d.trim().replace(/^@/, '').toLowerCase())
        .filter(Boolean),
      interview_day_1: form.interview_day_1 || null,
      interview_day_2: form.interview_day_2 || null,
      facebook_url: form.facebook_url.trim() || null,
      instagram_url: form.instagram_url.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      twitter_url: form.twitter_url.trim() || null,
      youtube_url: form.youtube_url.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      office_address: form.office_address.trim() || null,
      register_fields: form.register_fields,
      signup_fields: form.signup_fields,
    }
    const { error: upErr } = await supabase.from('platform_settings').update(payload).eq('id', 1)
    setBusy(false)
    if (upErr) {
      setError(errorMessage(upErr))
      return
    }
    await supabase.rpc('log_admin_event', {
      p_action: 'Platform Settings Updated',
      p_entity_type: 'settings',
      p_entity_id: '1',
      p_details: payload,
    })
    setSaved(true)
  }

  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title="Settings" subtitle="Only a Super Admin can change platform settings." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Recruitment and signup controls for the CIIE platform." />

      <form onSubmit={submit} className="max-w-3xl space-y-6">
        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">Registration</h2>
          <Toggle
            checked={form.allow_public_signup}
            onChange={(v) => setForm({ ...form, allow_public_signup: v })}
            label="Show Join CIIE button (allow public recruitment)"
          />
          <p className="text-xs text-slate-400">
            When off, the Join CIIE button is hidden across the site and new recruitment signups are blocked. Event
            registration on individual event pages is unaffected.
          </p>
          <Toggle
            checked={form.signup_domain_restriction}
            onChange={(v) => setForm({ ...form, signup_domain_restriction: v })}
            label="Restrict signup to allowed email domains"
          />
          <p className="text-xs text-slate-400">
            When on, only email addresses from the domains below can register. When off, every domain is allowed.
          </p>
          <Toggle
            checked={form.signup_email_otp}
            onChange={(v) => setForm({ ...form, signup_email_otp: v })}
            label="Require email OTP verification during registration"
          />
          <p className="text-xs text-slate-400">
            When on, applicants must verify their email with a 6-digit code before their submission is accepted. When off,
            the OTP step is skipped — submissions are accepted immediately without email verification.
          </p>
          <Toggle
            checked={form.allow_password_reset}
            onChange={(v) => setForm({ ...form, allow_password_reset: v })}
            label="Allow users to reset their own password (Forgot password)"
          />
          <p className="text-xs text-slate-400">
            When on, the “Forgot password?” link is shown on the login page and anyone can reset their password using the
            emailed code. When off, the link is hidden for everyone (including admins) and password resets via URL are
            blocked.
          </p>
          <Field label="Allowed email domains" hint="Comma separated — e.g. kluniversity.in">
            <TextInput value={form.domains} onChange={(e) => setForm({ ...form, domains: e.target.value })} />
          </Field>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">Attendance QR</h2>
          <Toggle
            checked={form.stop_dynamic_qr}
            onChange={(v) => setForm({ ...form, stop_dynamic_qr: v })}
            label="Stop dynamic QR (keep attendance QR static)"
          />
          <p className="text-xs text-slate-400">
            When off (default), every member's attendance QR changes automatically every 60 seconds. When on, the QR
            does not change or refresh every 60 seconds — the same code stays valid until it is scanned.
          </p>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">Join CIIE registration details</h2>
          <p className="text-xs text-slate-400">
            These fields appear on the Join CIIE (/signup) form. Every field is mandatory. Add any extra details you
            want to collect — phone, department, year of study, roll number, etc.
          </p>
          <FieldListEditor
            fields={form.signup_fields}
            hint="Leave empty to use the defaults (phone, year of study, department)."
            onChange={(signup_fields) => setForm({ ...form, signup_fields })}
          />
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">Additional details for register</h2>
          <p className="text-xs text-slate-400">
            Extra form fields collected under “Additional details” on every account registration page — /register/user,
            all role registrations and /register-faculty. NOT shown on the Join CIIE (/signup) form, which has its own
            section above. Answers are saved to each user's profile and visible in Admin → Members → member details and
            in the account-registrations export.
          </p>
          <FieldListEditor
            fields={form.register_fields}
            hint="Leave empty to collect only the standard details (phone, department, year of study)."
            onChange={(register_fields) => setForm({ ...form, register_fields })}
          />
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">GD &amp; Interview dates</h2>
          <p className="text-xs text-slate-400">
            Applicants are split into two batches by registration order — batch 1 attends on the first date, batch 2 on the
            second. Every student sees their assigned date right after registering.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Batch 1 — GD & Interview date">
              <TextInput type="date" value={form.interview_day_1} onChange={(e) => setForm({ ...form, interview_day_1: e.target.value })} />
            </Field>
            <Field label="Batch 2 — GD & Interview date">
              <TextInput type="date" value={form.interview_day_2} onChange={(e) => setForm({ ...form, interview_day_2: e.target.value })} />
            </Field>
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">Contact &amp; Social media</h2>
          <p className="text-xs text-slate-400">
            Shown on the public About and Contact pages and in the site footer.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact email">
              <TextInput type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="ciie@kluniversity.in" />
            </Field>
            <Field label="Contact phone">
              <TextInput type="tel" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="+91 98765 43210" />
            </Field>
          </div>
          <Field label="Office address">
            <TextInput value={form.office_address} onChange={(e) => setForm({ ...form, office_address: e.target.value })} placeholder="CIIE Office, KL University Campus" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Facebook URL">
              <TextInput type="url" value={form.facebook_url} onChange={(e) => setForm({ ...form, facebook_url: e.target.value })} placeholder="https://facebook.com/..." />
            </Field>
            <Field label="Instagram URL">
              <TextInput type="url" value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} placeholder="https://instagram.com/..." />
            </Field>
            <Field label="LinkedIn URL">
              <TextInput type="url" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/company/..." />
            </Field>
            <Field label="Twitter / X URL">
              <TextInput type="url" value={form.twitter_url} onChange={(e) => setForm({ ...form, twitter_url: e.target.value })} placeholder="https://x.com/..." />
            </Field>
            <div className="sm:col-span-2">
              <Field label="YouTube URL">
                <TextInput type="url" value={form.youtube_url} onChange={(e) => setForm({ ...form, youtube_url: e.target.value })} placeholder="https://youtube.com/@..." />
              </Field>
            </div>
          </div>
        </section>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Settings saved.</p>}

        <Button type="submit" disabled={busy}>
          <Save size={16} /> Save settings
        </Button>
      </form>
    </div>
  )
}
