import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Badge, Modal, TextInput } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/types'
import { cn, errorMessage, formatDateTime } from '@/lib/utils'
import { AlertTriangle, Camera, CheckCircle2, UserRound, XCircle } from 'lucide-react'

type ScanState = 'scanning' | 'success' | 'error' | 'stopped'

function Detail({
  label,
  value,
  strong,
  mono,
}: {
  label: string
  value: string
  strong?: boolean
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={cn('mt-0.5 text-slate-800', strong && 'font-bold', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}

interface ScanDetails {
  name?: string
  ciie_id?: string
  student_id?: string
  email?: string
  phone?: string
  department?: string
  year_of_study?: string
  college?: string
  registration_code?: string
  round?: number
  status?: string
  method?: string
  marked_at?: string
  marked_by?: { full_name?: string | null; ciie_id?: string | null } | null
}

interface AttendanceScannerPanelProps {
  eventId: string
}

export default function AttendanceScannerPanel({ eventId }: AttendanceScannerPanelProps) {
  const [event, setEvent] = useState<Event | null>(null)
  const [state, setState] = useState<ScanState>('stopped')
  const [message, setMessage] = useState('')
  const [scanDetails, setScanDetails] = useState<ScanDetails | null>(null)
  const [isDuplicate, setIsDuplicate] = useState(false)
  const [popup, setPopup] = useState<{ kind: 'error' | 'duplicate'; text: string } | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [round, setRound] = useState(1)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const busyRef = useRef(false)
  const duplicateRef = useRef(false)

  useEffect(() => {
    let active = true
    supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setEvent((data ?? null) as Event | null)
      })
    return () => {
      active = false
    }
  }, [eventId])

  useEffect(() => {
    if (event) setRound((r) => Math.max(1, Math.min(r, event.attendance_rounds)))
  }, [event])

  const safeStopCamera = async () => {
    try {
      if (scannerRef.current) await scannerRef.current.stop()
    } catch {
      // camera already stopped
    }
  }

  const safeClearScanner = async () => {
    try {
      if (scannerRef.current) await scannerRef.current.clear()
    } catch {
      // already cleared
    }
  }

  useEffect(() => {
    return () => {
      void safeStopCamera()
      void safeClearScanner()
    }
  }, [])

  const startScanner = async () => {
    setState('scanning')
    setMessage('')
    setScanDetails(null)
    setIsDuplicate(false)
    setPopup(null)
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          processCode(decoded).catch(() => undefined)
        },
        () => undefined,
      )
    } catch (err) {
      setState('stopped')
      setPopup({ kind: 'error', text: `Could not start camera: ${errorMessage(err)}` })
    }
  }

  const stopScanner = async () => {
    await safeStopCamera()
    await safeClearScanner()
    scannerRef.current = null
    setState('stopped')
  }

  const processCode = async (raw: string) => {
    if (busyRef.current) return
    const trimmed = raw.trim()
    if (!trimmed) return

    busyRef.current = true
    try {
      let payload: { type?: string; code?: string; event_id?: string } | null = null
      try {
        payload = JSON.parse(trimmed) as { type?: string; code?: string; event_id?: string }
      } catch {
        payload = null
      }

      // Legacy ticket QR payload (printed before codes went opaque) — verify only.
      if ((payload?.type === 'ticket' || payload?.type === 'event_attendance') && payload.code) {
        if (payload.event_id && eventId && payload.event_id !== eventId) {
          setState('error')
          setScanDetails(null)
          setPopup({ kind: 'error', text: 'No student registered for this event' })
          return
        }
        setState('success')
        setMessage('Ticket verified — registration details shown below (attendance not marked).')
        setScanDetails(await fetchScanDetails(payload.code, undefined))
        setPopup(null)
        return
      }

      const code = payload?.code ?? trimmed

      // Any other code is tried as an attendance code first; if that fails it is
      // looked up as a ticket/registration code and the details are shown instead.
      const result =
        payload?.type === 'member' && payload.code
          ? await markAttendance({ memberCode: payload.code, qrEventId: eventId })
          : await markAttendance({ memberCode: code, qrEventId: eventId })

      if (result.ok) {
        if (result.duplicate) {
          duplicateRef.current = true
          setState('error')
          setIsDuplicate(true)
          setScanDetails(await fetchScanDetails(result.registrationCode, result.memberId))
          setPopup({ kind: 'duplicate', text: result.message })
          return
        }
        setState('success')
        setMessage(result.message)
        setScanDetails(await fetchScanDetails(result.registrationCode, result.memberId))
        setPopup(null)
        return
      }

      const details = await fetchScanDetails(code, undefined)
      if (details) {
        setState('success')
        setMessage('Ticket verified — registration details shown below (attendance not marked).')
        setScanDetails(details)
        setPopup(null)
        return
      }

      setIsDuplicate(false)
      setState('error')
      const msg = result.message
      let popupText: string
      if (/invalid or expired attendance code/i.test(msg)) {
        popupText = 'This QR has expired — it rotates every few seconds. Ask the member to show the current code.'
      } else if (/event mismatch|no student registered|not registered/i.test(msg)) {
        popupText = 'No student registered for this event'
      } else {
        popupText = msg
      }
      setScanDetails(null)
      setPopup({ kind: 'error', text: popupText })
    } finally {
      busyRef.current = false
      const delay = duplicateRef.current ? 3200 : 1800
      duplicateRef.current = false
      window.setTimeout(async () => {
        if (scannerRef.current) {
          try {
            await scannerRef.current.resume()
            setState('scanning')
          } catch {
            // already stopped
          }
        }
      }, delay)
    }
  }

  const markAttendance = async (opts: {
    registrationCode?: string
    memberCode?: string
    qrEventId?: string
  }): Promise<{
    ok: boolean
    duplicate?: boolean
    message: string
    registrationCode?: string
    memberId?: string
    round?: number
  }> => {
    const { registrationCode, memberCode, qrEventId } = opts
    if (!registrationCode && !memberCode) return { ok: false, message: 'Empty code scanned.' }
    const { data, error } = await supabase.rpc('mark_attendance', {
      p_event_id: eventId,
      p_registration_code: registrationCode ?? null,
      p_member_code: memberCode ?? null,
      p_method: 'qr',
      p_qr_event_id: qrEventId ?? null,
      p_round: round,
    })
    if (error) {
      const code = (error as { code?: string }).code
      if (code === 'EVTMIS' || /event mismatch/i.test(errorMessage(error))) {
        return { ok: false, message: 'No student registered for this event' }
      }
      return { ok: false, message: errorMessage(error) }
    }
    const d = (data ?? null) as {
      duplicate?: boolean
      member_id?: string | null
      round?: number | null
      marked_at?: string | null
      marked_by?: { full_name?: string | null; ciie_id?: string | null } | null
    } | null
    const memberId = d?.member_id ?? undefined
    const attRound = d?.round ?? round

    if (d?.duplicate) {
      const by = d.marked_by?.full_name ?? d.marked_by?.ciie_id ?? 'an unknown member'
      return {
        ok: true,
        duplicate: true,
        message: `This QR has already been scanned at ${
          d.marked_at ? formatDateTime(d.marked_at) : 'an earlier time'
        } by ${by} — attendance was already recorded for this round.`,
        registrationCode,
        memberId,
        round: attRound,
      }
    }

    if (memberId) {
      const { data: profile } = await supabase.rpc('get_scan_details', {
        p_event_id: eventId,
        p_registration_code: registrationCode ?? null,
        p_member_id: memberId,
      })
      const name = (profile as { name?: string } | null)?.name
      return {
        ok: true,
        message: `${name ?? 'Member'} marked present for Round ${attRound}.`,
        registrationCode,
        memberId,
        round: attRound,
      }
    }
    return { ok: true, message: `Attendance recorded for Round ${attRound}.`, registrationCode, memberId, round: attRound }
  }

  const fetchScanDetails = async (registrationCode?: string, memberId?: string): Promise<ScanDetails | null> => {
    if (!eventId) return null
    const { data, error } = await supabase.rpc('get_scan_details', {
      p_event_id: eventId,
      p_registration_code: registrationCode ?? null,
      p_member_id: memberId ?? null,
    })
    if (error || !data) return null
    const d = data as ScanDetails
    return {
      name: d.name ?? undefined,
      ciie_id: d.ciie_id ?? undefined,
      student_id: d.student_id ?? undefined,
      email: d.email ?? undefined,
      phone: d.phone ?? undefined,
      department: d.department ?? undefined,
      year_of_study: d.year_of_study ?? undefined,
      college: d.college ?? undefined,
      registration_code: d.registration_code ?? undefined,
      round: d.round ?? undefined,
      method: d.method ?? undefined,
      marked_at: d.marked_at ? formatDateTime(d.marked_at) : undefined,
      marked_by: d.marked_by ?? null,
    }
  }

  const manualSubmit = async () => {
    const code = manualCode.trim()
    if (!code) return
    setManualCode('')
    await processCode(code)
  }

  return (
    <div>
      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <span className="flex items-center gap-2 font-bold text-slate-900">
            <Camera size={16} className="text-primary-600" /> Camera scanner
          </span>
          {state === 'scanning' ? (
            <button className="btn-secondary !px-3 !py-1 text-sm" onClick={stopScanner}>
              Stop
            </button>
          ) : (
            state !== 'success' && state !== 'error' && (
              <button className="btn-primary !px-3 !py-1 text-sm" onClick={startScanner}>
                Start camera
              </button>
            )
          )}
        </div>

        <div className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Round</span>
            {Array.from({ length: event?.attendance_rounds ?? 1 }, (_, i) => i + 1).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRound(r)}
                className={cn(
                  'h-8 min-w-8 rounded-lg px-2 text-sm font-semibold',
                  round === r ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {r}
              </button>
            ))}
          </div>

          <div id="qr-reader" className="mx-auto w-full max-w-sm" />

          {state === 'scanning' && (
            <p className="mt-3 text-center text-xs text-slate-400">
              Scan a ticket QR to verify registration, or a member/attendance QR to mark attendance for Round {round}.
            </p>
          )}

          {state === 'success' && (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-green-700">
              <CheckCircle2 size={18} />
              <span className="text-sm font-semibold">{message}</span>
            </div>
          )}

          {state === 'success' && scanDetails && (
            <div className="mt-3 rounded-xl border border-green-200 bg-white p-4 text-sm shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                <UserRound size={14} className="text-primary-600" /> Scanned student / registration
              </p>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {scanDetails.name && <Detail label="Name" value={scanDetails.name} strong />}
                {scanDetails.ciie_id && <Detail label="CIIE ID" value={scanDetails.ciie_id} mono />}
                {scanDetails.student_id && <Detail label="Student ID" value={scanDetails.student_id} />}
                {scanDetails.email && <Detail label="Email" value={scanDetails.email} />}
                {scanDetails.phone && <Detail label="Phone" value={scanDetails.phone} />}
                {scanDetails.department && <Detail label="Department" value={scanDetails.department} />}
                {scanDetails.year_of_study && <Detail label="Year" value={scanDetails.year_of_study} />}
                {scanDetails.college && <Detail label="College" value={scanDetails.college} />}
                {scanDetails.registration_code && <Detail label="Registration" value={scanDetails.registration_code} mono />}
                {scanDetails.round != null && <Detail label="Round" value={`Round ${scanDetails.round}`} />}
                {scanDetails.marked_by?.full_name && (
                  <Detail label="Marked by" value={scanDetails.marked_by.full_name} />
                )}
                {scanDetails.marked_at && <Detail label="Marked at" value={scanDetails.marked_at} />}
              </dl>
            </div>
          )}
          {isDuplicate && scanDetails && (
            <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm shadow-sm">
              <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-500">
                <AlertTriangle size={14} /> Already scanned — duplicate alert
              </p>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {scanDetails.name && <Detail label="Name" value={scanDetails.name} strong />}
                {scanDetails.ciie_id && <Detail label="CIIE ID" value={scanDetails.ciie_id} mono />}
                {scanDetails.student_id && <Detail label="Student ID" value={scanDetails.student_id} />}
                {scanDetails.registration_code && <Detail label="Registration" value={scanDetails.registration_code} mono />}
                {scanDetails.round != null && <Detail label="Round" value={`Round ${scanDetails.round}`} />}
                {scanDetails.marked_by?.full_name && (
                  <Detail label="Already scanned by" value={scanDetails.marked_by.full_name} />
                )}
                {scanDetails.marked_at && <Detail label="Already scanned at" value={scanDetails.marked_at} />}
              </dl>
            </div>
          )}
          {state === 'error' && (
            <p className="mt-3 text-center text-xs text-slate-400">
              Check the popup message and try again.
            </p>
          )}

          <div className="mt-5 border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Manual entry</p>
            <div className="flex gap-2">
              <TextInput placeholder="Paste the attendance QR code" value={manualCode} onChange={(e) => setManualCode(e.target.value)} />
              <button className="btn-secondary shrink-0" onClick={manualSubmit}>
                Mark
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Ticket codes (REG-…) verify registration details — they never mark attendance.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 text-center">
        <Badge tone={event?.registration_enabled ? 'green' : 'slate'}>
          Registration {event?.registration_enabled ? 'open' : 'closed'}
        </Badge>
      </div>

      <Modal
        open={!!popup}
        onClose={() => setPopup(null)}
        title={popup?.kind === 'duplicate' ? 'Already scanned' : 'Scan error'}
        footer={
          <button className="btn-primary" onClick={() => setPopup(null)}>
            OK
          </button>
        }
      >
        <div
          className={cn(
            'flex items-start gap-3 rounded-xl p-4 text-sm font-semibold',
            popup?.kind === 'duplicate' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700',
          )}
        >
          {popup?.kind === 'duplicate' ? <AlertTriangle size={20} className="mt-0.5 shrink-0" /> : <XCircle size={20} className="mt-0.5 shrink-0" />}
          <span>{popup?.text}</span>
        </div>
      </Modal>
    </div>
  )
}
