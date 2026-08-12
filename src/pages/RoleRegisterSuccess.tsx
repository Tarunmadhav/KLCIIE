import { Link, useLocation } from 'react-router-dom'
import { CheckCircle2, LayoutDashboard, QrCode } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function RoleRegisterSuccess() {
  const { profile } = useAuth()
  const location = useLocation()
  const state = (location.state as { label?: string; email?: string } | null) ?? {}
  const label = state.label ?? profile?.role

  return (
    <div className="w-full">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 px-8 py-10 text-center text-white">
          <CheckCircle2 size={44} className="mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold">Registration complete!</h1>
          <p className="mt-1 text-sm text-primary-100">You are now registered as {label}.</p>
        </div>
        <div className="px-8 py-8">
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            {state.email ? (
              <>
                A confirmation email has been sent to <span className="font-semibold text-slate-900">{state.email}</span>.
                Verify your email, then log in to access your account.
              </>
            ) : (
              'Your account is ready. Log in to access your dashboard.'
            )}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link to="/login" className="btn-primary">
              <LayoutDashboard size={16} /> Log in
            </Link>
            <Link to="/dashboard/qr" className="btn-secondary">
              <QrCode size={16} /> QR attendance
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
