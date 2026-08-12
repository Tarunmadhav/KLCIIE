import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarCheck, MailCheck, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button, Field, Spinner, TextInput } from '@/components/ui'
import { interviewDateFor, useSettings } from '@/hooks/useSettings'
import { supabase } from '@/lib/supabase'
import { errorMessage, formatDate } from '@/lib/utils'

interface JoinAppInfo {
  id: string
  email: string
  fullName: string
}

const STORAGE_KEY = 'ciie_join_application'
const VERIFIED_KEY = 'ciie_join_verified'

export default function VerifyApplication() {
  const settings = useSettings()
  const location = useLocation()

  const [info] = useState<JoinAppInfo | null>(() => {
    const fromState = (location.state as JoinAppInfo | null) ?? null
    if (fromState?.id) return fromState
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as JoinAppInfo
    } catch {
      // ignore corrupted storage
    }
    return null
  })

  const [verified, setVerified] = useState<{ batch: 1 | 2 | null; fullName: string } | null>(() => {
    try {
      const raw = sessionStorage.getItem(VERIFIED_KEY)
      if (raw) return JSON.parse(raw) as { batch: 1 | 2 | null; fullName: string }
    } catch {
      // ignore corrupted storage
    }
    return null
  })

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)

  useEffect(() => {
    if (info?.id) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(info))
    }
  }, [info])

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (!info) return
    setError('')
    setNotice('')
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code you received by email.')
      return
    }
    setBusy(true)
    const { data, error: err } = await supabase.rpc('verify_join_application', {
      p_id: info.id,
      p_code: code.trim(),
    })
    setBusy(false)
    if (err) {
      setError(errorMessage(err))
      return
    }
    const res = (data ?? {}) as { ok?: boolean; error?: string | null; batch?: number | null }
    if (!res.ok || res.error) {
      setError(res.error ?? 'Verification failed. Please try again.')
      return
    }
    const success = { batch: res.batch === 2 ? (2 as const) : (1 as const), fullName: info.fullName }
    setVerified(success)
    sessionStorage.setItem(VERIFIED_KEY, JSON.stringify(success))
    sessionStorage.removeItem(STORAGE_KEY)
  }

  const resend = async () => {
    if (!info) return
    setError('')
    setNotice('')
    setResendBusy(true)
    const { error: err } = await supabase.functions.invoke('send-recruit-email', {
      body: { kind: 'join-verification', application_id: info.id },
    })
    setResendBusy(false)
    if (err) {
      setError(`We couldn't email a new code. ${errorMessage(err)}`)
      return
    }
    setNotice(`A fresh verification code has been emailed to ${info.email}.`)
  }

  if (!info) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
          <MailCheck size={24} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Verification link missing</h1>
        <p className="mt-1 text-sm text-slate-500">
          We couldn't find your pending application. Please fill in the Join CIIE form again — we'll email you a fresh
          verification code.
        </p>
        <Link to="/signup" className="btn-primary mt-5">
          Apply to join CIIE
        </Link>
      </div>
    )
  }

  if (verified) {
    const date = interviewDateFor(settings, verified.batch)
    return (
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 px-8 py-10 text-center text-white">
          <CalendarCheck size={40} className="mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold">Application received!</h1>
          <p className="mt-1 text-sm text-primary-100">
            Welcome to CIIE, {verified.fullName}. Your application is being reviewed.
          </p>
        </div>

        <div className="px-8 py-8">
          <div className="rounded-xl border border-primary-200 bg-primary-50 p-5 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Your GD &amp; Interview</p>
            {date ? (
              <>
                <p className="mt-2 text-3xl font-black text-slate-900">{formatDate(date)}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Group Discussion and Personal Interview on the same day. Batch {verified.batch} of two.
                </p>
              </>
            ) : (
              <p className="mt-2 text-lg font-bold text-slate-700">Date will be announced</p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Interview dates are split into two batches by application order — batch {verified.batch ?? '1'} students
              attend on the first date, batch {verified.batch === 1 ? '2' : '1'} on the second.
            </p>
          </div>

          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck size={14} className="text-green-600" /> No account was created — you'll only make one if
              you're selected as a CIIE member.
            </p>
            <Link to="/" className="btn-secondary mt-3">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
          <MailCheck size={24} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Verify your email</h1>
        <p className="mt-1 text-sm text-slate-500">
          We emailed a 6-digit code to <span className="font-semibold text-slate-700">{info.email}</span>. Enter it to
          submit your application.
        </p>
      </div>

      <form onSubmit={(e) => void verify(e)} className="space-y-4">
        <Field label="Verification code" hint="The code expires in 15 minutes.">
          <TextInput
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            className="text-center text-lg tracking-[0.5em]"
          />
        </Field>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Spinner className="border-white/40 border-t-white" /> : 'Submit my application'}
        </Button>
      </form>

      <div className="mt-5 flex items-center justify-center gap-2">
        <button
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:underline disabled:text-slate-400"
          disabled={resendBusy}
          onClick={() => void resend()}
        >
          {resendBusy ? <Spinner className="h-4 w-4" /> : <RefreshCw size={14} />} Resend code
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-slate-500">
        Didn't apply to CIIE?{' '}
        <Link to="/" className="font-semibold text-primary-600 hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  )
}
