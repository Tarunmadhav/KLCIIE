import { Link } from 'react-router-dom'
import { CalendarCheck, QrCode } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { interviewDateFor, useSettings } from '@/hooks/useSettings'
import { formatDate } from '@/lib/utils'

export default function RecruitSuccess() {
  const { profile } = useAuth()
  const settings = useSettings()

  const batch = profile?.interview_batch ?? null
  const date = interviewDateFor(settings, batch)

  return (
    <div className="container-page max-w-2xl py-16">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 px-8 py-10 text-center text-white">
          <CalendarCheck size={40} className="mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold">Application received!</h1>
          <p className="mt-1 text-sm text-primary-100">
            Welcome to CIIE, {profile?.full_name ?? 'student'}. Your application is being reviewed.
          </p>
        </div>

        <div className="px-8 py-8">
          <div className="rounded-xl border border-primary-200 bg-primary-50 p-5 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Your GD &amp; Interview</p>
            {date ? (
              <>
                <p className="mt-2 text-3xl font-black text-slate-900">{formatDate(date)}</p>
                <p className="mt-1 text-sm text-slate-500">
                  Group Discussion and Personal Interview on the same day. Batch {batch} of two.
                </p>
              </>
            ) : (
              <p className="mt-2 text-lg font-bold text-slate-700">Date will be announced</p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Interview dates are split into two batches by application order — batch {batch ?? '1'} students attend on the
              first date, batch {batch === 1 ? '2' : '1'} on the second.
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link to="/dashboard" className="btn-secondary">
              Go to dashboard
            </Link>
            <Link to="/dashboard/qr" className="btn-primary">
              <QrCode size={16} /> View my attendance QR
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
