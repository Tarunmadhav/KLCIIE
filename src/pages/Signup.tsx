import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { Button, Field, Spinner, TextInput } from '@/components/ui'
import { CustomFieldInputs, missingFields } from '@/components/RegistrationFormFields'
import type { CustomFieldDef } from '@/lib/types'

const DEFAULT_FIELDS: CustomFieldDef[] = [
  { key: 'phone', label: 'Phone number', type: 'text', required: true },
  { key: 'year_of_study', label: 'Year of study', type: 'select', required: true, options: ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Other'] },
  { key: 'department', label: 'Department / Branch', type: 'text', required: true },
]

export default function Signup() {
  const { signUp, refreshProfile } = useAuth()
  const settings = useSettings()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!settings.allow_public_signup) {
      navigate('/login', { replace: true })
    }
  }, [settings.allow_public_signup, navigate])

  const fields = settings.signup_fields && settings.signup_fields.length > 0 ? settings.signup_fields : DEFAULT_FIELDS

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
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

    const meta: Record<string, string> = {
      student_id: studentId.trim(),
    }
    for (const f of fields) {
      meta[f.key] = (values[f.key] ?? '').trim()
    }

    if (!fullName.trim() || !studentId.trim()) {
      setError('Please enter your full name and student ID.')
      return
    }

    setBusy(true)
    const res = await signUp(fullName.trim(), email.trim(), password, meta)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      await refreshProfile()
      navigate('/recruit/success', { replace: true })
    } else {
      setNotice('Registration submitted! Check your email to confirm your address, then log in.')
    }
  }

  if (!settings.allow_public_signup) return null

  return (
    <div className="card p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
          <UserPlus size={24} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Join CIIE</h1>
        <p className="mt-1 text-sm text-slate-500">
          Apply to become a CIIE member. After the GD &amp; interview round, your application is reviewed by the team.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <TextInput required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Rahul Kumar" />
        </Field>
        <Field label="Student ID (university roll number)">
          <TextInput required value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g. 2300123456" />
        </Field>
        <Field label="Email" hint={settings.signup_domain_restriction ? 'A valid student email is mandatory.' : undefined}>
          <TextInput type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={settings.signup_domain_restriction ? 'you@kluniversity.in' : 'you@example.com'} />
        </Field>

        {fields.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Your details</h3>
            <CustomFieldInputs fields={fields} values={values} onChange={setValues} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password">
            <TextInput type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </Field>
          <Field label="Confirm password">
            <TextInput type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" />
          </Field>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Spinner className="border-white/40 border-t-white" /> : 'Apply to join CIIE'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already a member?{' '}
        <Link to="/login" className="font-semibold text-primary-600 hover:underline">
          Log in
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-slate-400">
        Have a registration key for a specific role?{' '}
        <Link to="/register" className="font-semibold text-primary-600 hover:underline">
          Register with a key
        </Link>
      </p>
    </div>
  )
}
