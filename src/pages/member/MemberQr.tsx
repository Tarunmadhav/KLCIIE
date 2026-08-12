import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, QrCode as QrIcon, RefreshCw } from 'lucide-react'
import { Badge, PageLoader, SelectInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useBranding } from '@/hooks/useBranding'
import { memberPayload, qrWithLogoDataUrl } from '@/lib/qr'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/types'
import { formatDate, formatDateTime } from '@/lib/utils'

interface RegisteredEvent {
  event_id: string
  event?: Pick<Event, 'id' | 'title' | 'start_date' | 'start_time' | 'end_time'> | null
}

interface RoundInfo {
  round: number
  code?: string
  used: boolean
  status: 'present' | 'absent'
  method?: string
  marked_at?: string
}

interface QrInfo {
  started: boolean
  attendance_rounds?: number
  rounds?: RoundInfo[]
  event_title?: string
  start_date?: string
  start_time?: string
  error?: string
}

function eventStartsAt(e: { start_date: string; start_time?: string | null }): Date {
  return new Date(`${e.start_date}T${e.start_time || '00:00'}:00`)
}

export default function MemberQrPage() {
  const { user, profile } = useAuth()
  const branding = useBranding()
  const logoUrl = branding.qr_attendance_logo_url ?? branding.ciie_logo_url ?? '/logo.jpg'
  const [rows, setRows] = useState<RegisteredEvent[]>([])
  const [eventId, setEventId] = useState('')
  const [qrInfo, setQrInfo] = useState<QrInfo | null>(null)
  const [qrMap, setQrMap] = useState<Record<number, string>>({})
  const [memberQr, setMemberQr] = useState('')
  const [memberCode, setMemberCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [qrLoading, setQrLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    let active = true
    const load = async () => {
      const [{ data }, { data: memberData }] = await Promise.all([
        supabase
          .from('event_registrations')
          .select('event_id, event:events(id, title, start_date, start_time, end_time)')
          .eq('member_id', user.id)
          .eq('status', 'confirmed'),
        supabase.from('member_qr_codes').select('code').eq('member_id', user.id).maybeSingle(),
      ])
      if (!active) return
      const regs = (data ?? []) as unknown as RegisteredEvent[]
      setRows(regs)
      const c = (memberData as { code?: string } | null)?.code
      if (c) {
        setMemberCode(c)
        setMemberQr(
          await qrWithLogoDataUrl(memberPayload({ type: 'member', v: 1, member_id: user.id, code: c }), logoUrl, 400),
        )
      }
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [user])

  const startedEvents = useMemo(
    () => rows.filter((r) => r.event && new Date(eventStartsAt(r.event)) <= new Date()),
    [rows],
  )

  const selectedEvent = useMemo(() => rows.find((r) => r.event_id === eventId)?.event ?? null, [rows, eventId])

  const refreshQr = async (id: string) => {
    if (!id) return
    setQrLoading(true)
    const { data, error } = await supabase.rpc('get_my_event_attendance_qr', { p_event_id: id })
    setQrLoading(false)
    if (error) {
      console.error('get_my_event_attendance_qr error:', error)
      setQrInfo({ started: false, attendance_rounds: 1, rounds: [], error: error.message })
      return
    }
    const info = (data ?? {}) as QrInfo
    setQrInfo(info)
    if (info.started && user) {
      const map: Record<number, string> = {}
      for (const r of info.rounds ?? []) {
        if (r.code) {
          map[r.round] = await qrWithLogoDataUrl(
            memberPayload({ type: 'member', v: 1, member_id: user.id, code: r.code }),
            logoUrl,
            240,
          )
        }
      }
      setQrMap(map)
    } else {
      setQrMap({})
    }
  }

  const onSelectEvent = (id: string) => {
    setEventId(id)
    setQrMap({})
    setQrInfo(null)
    void refreshQr(id)
  }

  if (loading) return <PageLoader />

  if (!profile) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-lg font-bold text-slate-900">Profile not found</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your account isn't linked to a member profile yet. Please contact the CIIE administrator.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-extrabold text-slate-900">QR Attendance</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pick a registered event to get its attendance QR. Show it to a CIIE member on duty to be marked present.
      </p>

      <div className="card mt-6 p-5">
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <CalendarClock size={15} className="text-primary-600" /> Select your event
        </label>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">You have no confirmed registrations yet.</p>
        ) : (
          <SelectInput
            value={eventId}
            onChange={(e) => onSelectEvent(e.target.value)}
          >
            <option value="">Choose an event…</option>
            {rows.map((r) => (
              <option key={r.event_id} value={r.event_id} disabled={!r.event}>
                {r.event?.title ?? 'Event'}
              </option>
            ))}
          </SelectInput>
        )}

        {qrLoading && <div className="mt-4"><PageLoader /></div>}

        {!qrLoading && eventId && selectedEvent && qrInfo && (
          <div className="mt-5">
            {qrInfo.started ? (
              <div>
                <div className="mb-3 text-center text-sm font-bold text-slate-700">
                  {(qrInfo.attendance_rounds ?? 1) > 1
                    ? `${qrInfo.attendance_rounds} attendance rounds`
                    : '1 attendance round'}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(qrInfo.rounds ?? []).map((r) => {
                    const dataUrl = qrMap[r.round]
                    return (
                      <div key={r.round} className="rounded-2xl border-2 border-slate-200 bg-white p-3 text-center">
                        <div className="relative mx-auto w-fit">
                          {dataUrl ? (
                            <div className="relative">
                              <img src={dataUrl} alt={`Round ${r.round} attendance QR`} className="mx-auto h-36 w-36" />
                              {r.status === 'present' && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white shadow-lg ring-4 ring-white">
                                    <CheckCircle2 size={26} />
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <PageLoader />
                          )}
                        </div>
                        <p className="mt-2 text-xs font-bold text-slate-700">Round {r.round}</p>
                        {r.status === 'present' ? (
                          <Badge tone="green">{r.marked_at ? `Present · ${formatDateTime(r.marked_at)}` : 'Present'}</Badge>
                        ) : (
                          <Badge tone="slate">Not scanned yet</Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-500">
                  <QrIcon size={15} /> Each round QR is refreshed automatically once attendance is marked.
                </p>
                <button className="btn-secondary mt-3 w-full" onClick={() => refreshQr(eventId)}>
                  <RefreshCw size={14} /> Refresh QRs
                </button>
              </div>
            ) : (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-semibold">This event hasn't started yet.</p>
                <p className="mt-1 text-xs text-amber-700">
                  {formatDate(selectedEvent.start_date)} at {selectedEvent.start_time || '00:00'} — the QR will appear
                  here once the event begins.
                </p>
                {qrInfo.error && (
                  <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
                    Server error: {qrInfo.error}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {profile.role !== 'user' && (
        <>
          <h2 className="mt-8 flex items-center gap-2 text-base font-bold text-slate-900">
            <QrIcon size={16} className="text-primary-600" /> My member QR
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Your personal CIIE identity QR — use it at any event even if you didn't pre-register.
          </p>

          <div className="card mt-3 overflow-hidden text-center">
            <div className="border-b border-slate-200 bg-gradient-to-r from-primary-600 to-primary-800 px-6 py-4 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">CIIE Member</p>
              <p className="text-lg font-extrabold">{profile.full_name}</p>
              <p className="text-xs text-primary-100">{profile.ciie_id}</p>
            </div>
            <div className="p-6">
              {memberQr ? <img src={memberQr} alt="Member QR" className="mx-auto h-56 w-56" /> : <PageLoader />}
              <p className="mt-4 font-mono text-xs text-slate-400">{memberCode}</p>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-500">
            <QrIcon size={16} className="mt-0.5 shrink-0" />
            <span>
              Keep these QRs private — they are tied to your CIIE identity.
            </span>
          </div>
        </>
      )}

      {startedEvents.length === 0 && rows.length > 0 && (
        <div className="mt-4">
          <Badge tone="slate">No events running right now</Badge>
        </div>
      )}
    </div>
  )
}
