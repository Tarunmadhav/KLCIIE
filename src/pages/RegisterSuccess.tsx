import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Download, Printer } from 'lucide-react'
import Logo from '@/components/Logo'
import { PageLoader } from '@/components/ui'
import { useBranding } from '@/hooks/useBranding'
import { useAuth } from '@/hooks/useAuth'
import { qrWithLogoDataUrl } from '@/lib/qr'
import { supabase } from '@/lib/supabase'
import type { EventRegistration } from '@/lib/types'
import { formatDate } from '@/lib/utils'

export default function RegisterSuccess() {
  const { registrationId } = useParams<{ registrationId: string }>()
  const { user } = useAuth()
  const branding = useBranding()
  const location = useLocation()
  const [reg, setReg] = useState<EventRegistration | null>(null)
  const [event, setEvent] = useState<{ title: string; start_date: string } | null>(null)
  const [qr, setQr] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const navReg = (location.state as { registration?: EventRegistration } | null)?.registration

  useEffect(() => {
    let active = true
    const load = async () => {
      let r: EventRegistration | null = navReg ?? null
      if (!r && user && registrationId) {
        const { data } = await supabase.rpc('get_my_ticket', { p_registration_id: registrationId })
        r = (data as EventRegistration) ?? null
      }
      if (!r) {
        setLoading(false)
        return
      }
      const { data: ev } = await supabase.from('events').select('title, start_date').eq('id', r.event_id).maybeSingle()
      if (active) {
        setReg(r)
        setEvent((ev as { title: string; start_date: string } | null) ?? null)
        setQr(await qrWithLogoDataUrl(r.registration_code, branding.qr_attendance_logo_url ?? branding.ciie_logo_url ?? '/logo.jpg'))
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [registrationId, user, navReg, branding])

  const downloadQr = useMemo(() => {
    if (!qr) return () => undefined
    return () => {
      const a = document.createElement('a')
      a.href = qr
      a.download = `${reg?.registration_code ?? 'ticket'}-qr.png`
      a.click()
    }
  }, [qr, reg])

  if (loading) return <PageLoader />
  if (!reg) {
    return (
      <div className="container-page py-20 text-center">
        <p className="text-lg font-semibold text-slate-700">Ticket not found</p>
        <p className="mt-1 text-sm text-slate-500">Log in with the email you registered with to view your ticket.</p>
        <Link to="/login" className="btn-primary mt-4">
          Log in
        </Link>
      </div>
    )
  }

  return (
    <div className="container-page max-w-md py-10 text-center">
      <h1 className="text-2xl font-extrabold text-slate-900">You're registered! 🎉</h1>
      <p className="mt-1 text-sm text-slate-500">
        Show this QR at the venue to confirm your attendance.
      </p>

      <div className="card mx-auto mt-6 overflow-hidden text-center">
        <div className="border-b border-slate-200 bg-gradient-to-r from-primary-600 to-primary-800 px-6 py-4 text-white">
          <div className="flex justify-center">
            <Logo variant="light" className="[&_div]:h-8 [&_img]:h-8" />
          </div>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em]">CIIE Event</p>
          <p className="text-lg font-extrabold uppercase">{event?.title ?? 'Event'}</p>
        </div>

        <div className="p-6">
          {qr && <img src={qr} alt="Attendance QR" className="mx-auto h-64 w-64" />}
          <p className="mt-4 font-mono text-sm font-bold tracking-wider text-slate-800">{reg.registration_code}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(event?.start_date)}</p>
        </div>
      </div>

      <div className="mt-5 flex justify-center gap-3">
        <button className="btn-secondary" onClick={downloadQr}>
          <Download size={15} /> Download QR
        </button>
        <button className="btn-secondary" onClick={() => window.print()}>
          <Printer size={15} /> Print
        </button>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4 text-sm">
        <Link to="/dashboard" className="font-semibold text-primary-600 hover:underline">
          Go to dashboard
        </Link>
        <Link to="/upcoming-events" className="font-semibold text-primary-600 hover:underline">
          More events
        </Link>
      </div>
    </div>
  )
}
