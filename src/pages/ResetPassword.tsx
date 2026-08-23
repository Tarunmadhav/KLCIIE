import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, MailCheck, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Field, Spinner, TextInput } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { emailInvokeMessage } from '@/lib/utils'

export default function ResetPassword() {
  const [step, setStep] = useState<'email' | 'otp' | 'done'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setInterval(() => setCooldown((c) => (c > 1 ? c - 1 : 0)), 1000)
    return () => window.clearInterval(t)
  }, [cooldown])

  const sendCode = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const { error: err } = await supabase.functions.invoke('send-recruit-email', {
        body: { kind: 'registration-otp', purpose: 'password-reset', to_email: email.trim(), full_name: '' },
      })
      if (err) {
        setError(await emailInvokeMessage(err))
        return
      }
      setNotice(`A 6-digit reset code has been emailed to ${email.trim()}. It expires in 15 minutes.`)
      setCode('')
      setPassword('')
      setConfirm('')
      setCooldown(60)
      setStep('otp')
    } finally {
      setBusy(false)
    }
  }

  const submitReset = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code you received by email.')
      return
    }
    if (password.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    const { data } = await supabase.rpc('reset_password_with_otp', {
      p_email: email.trim(),
      p_code: code.trim(),
      p_new_password: password,
    })
    setBusy(false)
    if (!(data as { ok?: boolean } | null)?.ok) {
      setError((data as { error?: string } | null)?.error ?? 'Could not reset the password. Please try again.')
      return
    }
    setStep('done')
  }

  const resend = async () => {
    if (cooldown > 0 || busy) return
    setError('')
    setNotice('')
    setBusy(true)
    const { error: err } = await supabase.functions.invoke('send-recruit-email', {
      body: { kind: 'registration-otp', purpose: 'password-reset', to_email: email.trim(), full_name: '' },
    })
    setBusy(false)
    if (err) {
      setError(await emailInvokeMessage(err))
      return
    }
    setNotice('A new code has been emailed to you.')
    setCooldown(60)
  }

  if (step === 'done') {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-600">
          <MailCheck size={24} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Password updated</h1>
        <p className="mt-2 text-sm text-slate-500">
          Your password has been changed and all other sessions were logged out. Log in with your new password.
        </p>
        <Link to="/login" className="btn-primary mt-6 inline-flex w-full items-center justify-center">
          Go to login
        </Link>
      </div>
    )
  }

  return (
    <div className="card p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
          <ShieldCheck size={24} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">
          {step === 'email'
            ? 'Enter your account email — we will send you a verification code.'
            : `Enter the code sent to ${email.trim()} and choose a new password.`}
        </p>
      </div>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="space-y-4">
          <Field label="Email">
            <TextInput
              type="email"
              required
              autoComplete="email"
              placeholder="you@kluniversity.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Spinner className="border-white/40 border-t-white" /> : (
              <>
                <KeyRound size={15} /> Send reset code
              </>
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitReset} className="space-y-4">
          <Field label="6-digit code">
            <TextInput
              inputMode="numeric"
              maxLength={6}
              required
              className="text-center font-mono text-lg tracking-[0.4em]"
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field label="New password">
            <TextInput
              type="password"
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              type="password"
              required
              autoComplete="new-password"
              placeholder="Repeat the new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>

          {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Spinner className="border-white/40 border-t-white" /> : 'Set new password'}
          </Button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" className="font-medium text-primary-600 hover:underline disabled:text-slate-400" disabled={cooldown > 0 || busy} onClick={() => void resend()}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
            <Link to="/login" className="font-medium text-slate-500 hover:underline">
              Back to login
            </Link>
          </div>
        </form>
      )}

      {step === 'email' && (
        <p className="mt-6 text-center text-sm text-slate-500">
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:underline">
            Log in
          </Link>
        </p>
      )}
    </div>
  )
}
