import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { KeyRound, ShieldCheck, Timer } from 'lucide-react'
import { Button, Field, PageLoader, Spinner, TextInput } from '@/components/ui'
import { CustomFieldInputs, missingFields } from '@/components/RegistrationFormFields'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { supabase } from '@/lib/supabase'
import type { CustomFieldDef } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

const DEFAULT_EXTRA: CustomFieldDef[] = [
  { key: 'phone', label: 'Phone number', type: 'text', required: true },
  { key: 'department', label: 'Department / Branch', type: 'text', required: true },
  { key: 'year_of_study', label: 'Year of study', type: 'select', required: true, options: ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'] },
]

export default function RoleRegister() {
  const { slug } = useParams<{ slug: string }>()
  const { signUp, refreshProfile } = useAuth()
  const settings = useSettings()
  const navigate = useNavigate()

  const [info, setInfo] = useState<{ label: string; role: string; enabled: boolean; requires_keys: boolean; fields: CustomFieldDef[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const [fullName, setFullName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [staticKey, setStaticKey] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (!slug) return
    let active = true
    setLoading(true)
    setLoadError('')
    supabase.rpc('get_registration_role', { p_slug: slug }).then(({ data, error }) => {
      if (!active) return
      if (error) {
        setLoadError(error.message)
        setLoading(false)
        return
      }
      const d = (data as { label: string; role: string; enabled: boolean; requires_keys: boolean; fields: CustomFieldDef[] } | null) ?? null
      setInfo(d)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [slug])

  if (loading) return <PageLoader />
  if (!info || !info.enabled) {
    return (
      <div className="container-page py-20 text-center">
        <p className="text-lg font-semibold text-slate-900">Registration page not available</p>
        <p className="mt-1 text-sm text-slate-500">This role's registration page is disabled or does not exist.</p>
        {loadError && (
          <p className="mx-auto mt-3 max-w-md rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
        )}
        <Link to="/register" className="btn-primary mt-4">
          View registration options
        </Link>
      </div>
    )
  }

  const fields = info.fields && info.fields.length > 0 ? info.fields : DEFAULT_EXTRA

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    const missing = missingFields(fields, values)
    if (missing) {
      setError(missing)
      return
    }

    const domain = email.trim().split('@').pop()?.toLowerCase()
    if (settings.signup_domain_restriction) {
      const allowed = (settings.signup_allowed_domains ?? [])
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)
      if (!domain || !allowed.some((d) => domain === d || domain.endsWith('.' + d))) {
        setError(`Registration is limited to ${allowed.map((d) => `@${d}`).join(', ')} email addresses.`)
        return
      }
    }

    setBusy(true)
    const { data, error: valErr } = await supabase.rpc('validate_role_registration', {
      p_slug: slug,
      p_static_key: staticKey.trim(),
      p_code: mfaCode.trim(),
      p_email: email.trim(),
    })
    const res = data as { valid?: boolean; error?: string | null; token?: string; role?: string; label?: string } | null
    if (valErr || !res?.valid) {
      setBusy(false)
      setError(res?.error ?? errorMessage(valErr ?? 'Registration failed'))
      return
    }

    const meta: Record<string, string> = {
      role: res.role ?? info.role,
      role_slug: slug ?? '',
      registration_token: res.token ?? '',
      student_id: studentId.trim(),
    }
    for (const f of fields) {
      meta[f.key] = (values[f.key] ?? '').trim()
    }
    if (!fullName.trim() || !studentId.trim()) {
      setError('Please enter your full name and student ID.')
      return
    }
    const sign = await signUp(fullName.trim(), email.trim(), password, meta)
    setBusy(false)
    if (sign.error) {
      setError(sign.error)
      return
    }
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session) {
      await refreshProfile()
    }
    navigate('/register/role/success', { state: { label: res.label ?? info.label, email: email.trim() } })
  }

  return (
    <div className="w-full">
      <div className="card p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Register as {info.label}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {info.requires_keys
              ? 'You need the registration key and the current one-time code (changes every minute) from the CIIE admin.'
              : 'Create your account. No registration key needed.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *">
              <TextInput required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Rahul Kumar" />
            </Field>
            <Field label="Student ID *">
              <TextInput required value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="University roll number" />
            </Field>
            <Field label="Email *" hint={settings.signup_domain_restriction ? 'Only KL University email addresses are accepted.' : undefined}>
              <TextInput type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={settings.signup_domain_restriction ? 'you@kluniversity.in' : 'you@example.com'} />
            </Field>
            <Field label="Password *">
              <TextInput type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </Field>
            <Field label="Confirm password *">
              <TextInput type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
            </Field>
          </div>

          {fields.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <h3 className="mb-3 text-sm font-bold text-slate-900">Additional details</h3>
              <CustomFieldInputs fields={fields} values={values} onChange={setValues} />
            </div>
          )}

          {info.requires_keys && (
            <div className="rounded-xl border border-primary-200 bg-primary-50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-bold text-primary-800">
                <KeyRound size={15} /> Registration key &amp; one-time code
              </h3>
              <p className="mt-1 text-xs text-primary-700/80">
                Ask the CIIE admin for the current code — it refreshes every minute.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Registration key *">
                  <TextInput
                    required
                    value={staticKey}
                    onChange={(e) => setStaticKey(e.target.value)}
                    placeholder="Enter the CIIE registration key"
                    autoComplete="off"
                  />
                </Field>
                <Field label="One-time MFA code *">
                  <TextInput
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.toUpperCase())}
                    placeholder="6-character code"
                    autoComplete="off"
                    className="!font-mono !tracking-widest"
                  />
                </Field>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-primary-700/70">
                <Timer size={12} /> Codes are alphanumeric and change every 60 seconds.
              </p>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Spinner className="border-white/40 border-t-white" /> : <>Complete registration</>}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Want to apply the normal way?{' '}
          <Link to="/signup" className="font-semibold text-primary-600 hover:underline">
            Join CIIE
          </Link>
        </p>
      </div>
    </div>
  )
}
