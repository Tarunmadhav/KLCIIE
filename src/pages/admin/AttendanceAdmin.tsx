import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, ChevronDown, ChevronRight, Download, Ticket } from 'lucide-react'
import { Badge, EmptyState, PageHeader, PageLoader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { downloadExcelSheets } from '@/lib/excel'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

interface EventStat {
  event_id: string
  title: string
  status: string
  start_date: string
  registrations: number
  present: number
  absent: number
  attendance_rounds: number
  certificates: number
}

interface Attendee {
  id: string
  member_id?: string | null
  attendee_name: string
  registration_code: string
  student_id: string | null
  email: string | null
  phone: string | null
  department: string | null
  year_of_study: string | null
  college: string | null
  member?: { full_name?: string; ciie_id?: string } | null
  attendance?: Array<{
    round: number
    status: string
    method: string
    marked_at: string
    marked_by?: { full_name?: string | null; ciie_id?: string | null } | null
  }>
}

interface AttRow {
  registration_id: string | null
  member_id: string | null
  round: number
  status: string
  method: string
  marked_at: string
  registration: { registration_code: string; attendee_name: string; member_id: string | null } | null
  member: { full_name: string | null; ciie_id: string | null } | null
  marked_by: { full_name: string | null; ciie_id: string | null } | null
}

interface LoadedList {
  rows: Attendee[]
  error?: string
}

export default function AttendanceAdmin() {
  const [rows, setRows] = useState<EventStat[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [lists, setLists] = useState<Record<string, LoadedList>>({})

  useEffect(() => {
    let active = true
    supabase.rpc('admin_get_event_stats').then(({ data }) => {
      if (active) {
        setRows((data ?? []) as EventStat[])
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const loadEventData = async (eventId: string) => {
    const [{ data: regData }, { data: attData }] = await Promise.all([
      supabase
        .from('event_registrations')
        .select('id, member_id, attendee_name, registration_code, student_id, email, phone, department, year_of_study, college, status, created_at, member:profiles(full_name, ciie_id)')
        .eq('event_id', eventId)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: true }),
      supabase
        .from('attendance')
        .select('registration_id, member_id, round, status, method, marked_at, registration:event_registrations(registration_code, attendee_name, member_id), member:profiles!attendance_member_id_fkey(full_name, ciie_id), marked_by:profiles!attendance_marked_by_fkey(full_name, ciie_id)')
        .eq('event_id', eventId)
        .order('marked_at', { ascending: false }),
    ])
    const att = (attData ?? []) as unknown as AttRow[]
    return { regs: (regData ?? []) as unknown as Attendee[], att }
  }

  const toggle = async (eventId: string) => {
    const next = { ...open, [eventId]: !open[eventId] }
    setOpen(next)
    if (next[eventId] && !lists[eventId]) {
      const { regs, att } = await loadEventData(eventId)
      const attMap = new Map<
        string,
        Array<{ round: number; status: string; method: string; marked_at: string; marked_by?: { full_name?: string | null; ciie_id?: string | null } | null }>
      >()
      for (const a of att) {
        if (!a.registration_id) continue
        if (!attMap.has(a.registration_id)) attMap.set(a.registration_id, [])
        attMap.get(a.registration_id)!.push({
          round: a.round,
          status: a.status,
          method: a.method,
          marked_at: a.marked_at,
          marked_by: a.marked_by,
        })
      }
      const merged = regs.map((r) => ({
        ...r,
        attendance: attMap.get(r.id) ?? [],
      }))
      setLists({ ...lists, [eventId]: { rows: merged } })
    }
  }

  const downloadExcel = async (e: EventStat) => {
    const roundsCount = Math.max(1, e.attendance_rounds ?? 1)
    const rounds = Array.from({ length: roundsCount }, (_, i) => i + 1)
    const { regs, att } = await loadEventData(e.event_id)
    const byReg = new Map<string, Map<number, { method: string; marked_at: string; marked_by: AttRow['marked_by'] }>>()
    const byMember = new Map<string, Map<number, { method: string; marked_at: string; marked_by: AttRow['marked_by'] }>>()
    for (const a of att) {
      if (a.status !== 'present') continue
      const info = { method: a.method, marked_at: a.marked_at, marked_by: a.marked_by }
      if (a.registration_id) {
        if (!byReg.has(a.registration_id)) byReg.set(a.registration_id, new Map())
        byReg.get(a.registration_id)!.set(a.round, info)
      }
      if (a.member_id) {
        if (!byMember.has(a.member_id)) byMember.set(a.member_id, new Map())
        byMember.get(a.member_id)!.set(a.round, info)
      }
    }
    const infoFor = (r: Attendee, round: number) =>
      byReg.get(r.id)?.get(round) ?? (r.member_id ? byMember.get(r.member_id)?.get(round) : undefined)
    const registeredRows = regs.map((r, i) => {
      const row: Record<string, unknown> = {
        'S.No': i + 1,
        'Registration ID': r.registration_code,
        'Student ID': r.student_id ?? r.member?.ciie_id ?? '—',
        Name: r.member?.full_name ?? r.attendee_name,
        Email: r.email ?? '—',
        Phone: r.phone ?? '—',
        Department: r.department ?? '—',
        Year: r.year_of_study ?? '—',
        College: r.college ?? '—',
      }
      let presentRounds = 0
      for (const n of rounds) {
        const p = infoFor(r, n)
        if (p) presentRounds++
        row[`Round ${n} Status`] = p ? 'Present' : 'Absent'
        row[`Round ${n} Method`] = p?.method ?? '—'
        row[`Round ${n} Scanned by`] = p?.marked_by?.full_name ?? '—'
        row[`Round ${n} Scanned by CIIE ID`] = p?.marked_by?.ciie_id ?? '—'
        row[`Round ${n} Marked at`] = p ? formatDateTime(p.marked_at) : '—'
      }
      row['Final Attendance'] = presentRounds === roundsCount ? 'Present' : 'Absent'
      row['No. of Present Rounds'] = presentRounds
      row['No. of Absent Rounds'] = roundsCount - presentRounds
      return row
    })
    const attendanceLogRows = att.map((a, i) => ({
      'S.No': i + 1,
      'Registration ID': a.registration?.registration_code ?? '—',
      'Student ID': a.member?.ciie_id ?? '—',
      Name: a.member?.full_name ?? a.registration?.attendee_name ?? '—',
      Round: a.round,
      Status: a.status,
      Method: a.method,
      'Scanned by': a.marked_by?.full_name ?? '—',
      'Scanned by CIIE ID': a.marked_by?.ciie_id ?? '—',
      'Marked at': formatDateTime(a.marked_at),
    }))
    const base = `attendance-${e.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
    downloadExcelSheets(`${base}-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      { name: 'Registered', rows: registeredRows },
      { name: 'Attendance Log', rows: attendanceLogRows },
    ])
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Scan QR codes or track attendance per event. Points are awarded automatically."
        actions={
          rows.length > 0 ? (
            <Link to={`/admin/attendance/${rows[0].event_id}`} className="btn-primary">
              <Camera size={15} /> Open scanner
            </Link>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={<Ticket size={40} />} title="No events found" subtitle="Create an event first, then manage attendance." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((e) => {
            const isOpen = !!open[e.event_id]
            const list = lists[e.event_id]
            return (
              <div key={e.event_id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/admin/events/${e.event_id}`} className="font-bold text-slate-900 hover:text-primary-600">
                    {e.title}
                  </Link>
                  <Badge tone={e.status === 'published' ? 'green' : e.status === 'completed' ? 'slate' : 'amber'}>{e.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-400">{formatDate(e.start_date)}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="font-extrabold text-slate-900">{e.registrations}</p>
                    <p className="text-[10px] text-slate-400">Registrations</p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-2">
                    <p className="font-extrabold text-green-700">{e.present}</p>
                    <p className="text-[10px] text-slate-400">Present</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-2">
                    <p className="font-extrabold text-red-600">{e.absent}</p>
                    <p className="text-[10px] text-slate-400">Absent</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button className="btn-primary" onClick={() => void downloadExcel(e)}>
                    <Download size={14} /> Excel
                  </button>
                  <button className="btn-secondary" onClick={() => toggle(e.event_id)}>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {isOpen ? 'Hide' : 'Attendees'}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-3 max-h-72 overflow-auto">
                    {!list ? (
                      <PageLoader />
                    ) : list.error ? (
                      <p className="text-xs text-red-600">{list.error}</p>
                    ) : list.rows.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-400">No confirmed registrations.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {list.rows.map((r) => {
                          const roundsCount = Math.max(1, e.attendance_rounds ?? 1)
                          const attOf = (n: number) => r.attendance?.find((a) => (a.round ?? 1) === n)
                          const presentRounds = Array.from({ length: roundsCount }, (_, i) => i + 1).filter(
                            (n) => attOf(n)?.status === 'present',
                          ).length
                          const finalPresent = presentRounds === roundsCount
                          const name = r.member?.full_name ?? r.attendee_name
                          return (
                            <li key={r.id} className="flex items-start justify-between gap-2 py-2">
                              <div className="min-w-0">
                                <p className={cn('truncate text-sm font-semibold', finalPresent ? 'text-slate-900' : 'text-slate-600')}>
                                  {name}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {r.student_id ?? r.member?.ciie_id ?? r.registration_code}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {Array.from({ length: roundsCount }, (_, i) => i + 1).map((n) => {
                                    const a = attOf(n)
                                    const present = a?.status === 'present'
                                    return (
                                      <span
                                        key={n}
                                        className={cn(
                                          'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                          present ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400',
                                        )}
                                      >
                                        R{n} {present ? 'Present' : '—'}
                                      </span>
                                    )
                                  })}
                                </div>
                              </div>
                              <Badge tone={finalPresent ? 'green' : 'slate'}>{finalPresent ? 'Present' : 'Absent'}</Badge>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
