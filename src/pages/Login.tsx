import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { Button, Field, Spinner, TextInput } from '@/components/ui'
import { errorMessage } from '@/lib/utils'

export default function Login() {
  const { signIn } = useAuth()
  const { allow_password_reset: allowReset } = useSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const res = await signIn(email.trim(), password)
      if (res.error) {
        setError(res.error)
        return
      }
      const from = (location.state as { from?: string } | null)?.from
      if (res.mfaSetupRequired) {
        setSuccess('Logged in successfully — setting up security…')
        setTimeout(() => navigate('/auth/mfa-setup', { replace: true }), 600)
      } else if (res.mfaVerifyRequired) {
        setSuccess('Logged in successfully — verifying security code…')
        setTimeout(() => navigate('/auth/mfa-verify', { replace: true }), 600)
      } else if (res.isAdmin) {
        setSuccess('Logged in successfully — opening the admin console…')
        setTimeout(() => navigate(from?.startsWith('/admin') ? from : '/admin', { replace: true }), 600)
      } else {
        const home = res.role === 'faculty' ? '/faculty' : '/dashboard'
        setSuccess('Logged in successfully — opening your dashboard…')
        setTimeout(() => navigate(from ?? home, { replace: true }), 600)
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
          <ShieldCheck size={24} />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Log in to your CIIE account</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
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
        <Field label="Password">
          <TextInput
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          {allowReset && (
            <Link to="/reset-password" className="text-xs font-medium text-primary-600 hover:underline">
              Forgot password?
            </Link>
          )}
        </div>

        {success && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Spinner className="border-white/40 border-t-white" /> : 'Log in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No account?{' '}
        <Link to="/register/user" className="font-semibold text-primary-600 hover:underline">
          Register / Sign up
        </Link>
      </p>
    </div>
  )
}
