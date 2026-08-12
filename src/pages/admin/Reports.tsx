import { useEffect, useState } from 'react'
import { BarChart3, CheckCircle2, ClipboardList, Download, FileSpreadsheet, XCircle } from 'lucide-react'
import { Badge, EmptyState, PageHeader, PageLoader, SelectInput } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { downloadExcelSheets } from '@/lib/excel'
import { cn, downloadTextFile, formatDate, formatDateTime } from '@/lib/utils'

interface MemberStat {
  member_id: string
  full_name: string | null
  ciie_id: string | null
  department: string | null
  year_of_study: string | null
  team: string | null
  total_points: number
  events_worked: number
  events_attended: number
  volunteer_activities: number
  achievements: number
  certificates: number
}

interface EventStat {
  event_id: string
  title: string
  status: string
  start_date: string
  registrations: number
  present: number
  absent: number
  team_size: number
  certificates: number
}

interface RegRow {
  id: string
  registration_code: string
  member_id: string | null
  attendee_name: string
  student_id: string | null
  email: string | null
  phone: string | null
  department: string | null
  year_of_study: string | null
  college: string | null
  form_data: Record<string, unknown>
  status: string
  created_at: string
  profile: { full_name: string | null; ciie_id: string | null } | null
}

interface AttRow {
  id: string
  member_id: string | null
  round: number
  status: string
  marked_at: string
  method: string
  registration: {
    registration_code: string
    attendee_name: string
    student_id: string | null
    email: string | null
    phone: string | null
    department: string | null
    year_of_study: string | null
    college: string | null
    form_data: Record<string, unknown>
    member_id: string | null
  } | null
  member: { full_name: string | null; ciie_id: string | null } | null
  marked_by: { full_name: string | null; ciie_id: string | null } | null
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  const keys = rows.length ? Object.keys(rows[0]) : []
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n')
}

function labelize(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function collectFormKeys(regs: RegRow[]): string[] {
  const keys = new Set<string>()
  for (const r of regs) {
    for (const k of Object.keys(r.form_data ?? {})) keys.add(k)
  }
  return Array.from(keys).sort()
}

export default function Reports() {
  const [members, setMembers] = useState<MemberStat[]>([])
  const [events, setEvents] = useState<EventStat[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [regs, setRegs] = useState<RegRow[]>([])
  const [attendance, setAttendance] = useState<AttRow[]>([])
  const [eventLoading, setEventLoading] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      const [{ data: memberData }, { data: eventData }] = await Promise.all([
        supabase.from('v_member_stats').select('*').order('total_points', { ascending: false }),
        supabase.rpc('admin_get_event_stats'),
      ])
      if (active) {
        setMembers((memberData ?? []) as MemberStat[])
        setEvents((eventData ?? []) as EventStat[])
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const loadEventReport = async (id: string) => {
    setSelectedEventId(id)
    if (!id) {
      setRegs([])
      setAttendance([])
      return
    }
    setEventLoading(true)
    const [r, a] = await Promise.all([
      supabase
        .from('event_registrations')
        .select(
          'id, registration_code, member_id, attendee_name, student_id, email, phone, department, year_of_study, college, form_data, status, created_at, profile:profiles(full_name, ciie_id)',
        )
        .eq('event_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('attendance')
        .select(
          'id, member_id, round, status, marked_at, method, registration:event_registrations(registration_code, attendee_name, student_id, email, phone, department, year_of_study, college, form_data, member_id), member:profiles!attendance_member_id_fkey(full_name, ciie_id), marked_by:profiles!attendance_marked_by_fkey(full_name, ciie_id)',
        )
        .eq('event_id', id)
        .order('marked_at', { ascending: true }),
    ])
    setRegs((r.data ?? []) as unknown as RegRow[])
    setAttendance((a.data ?? []) as unknown as AttRow[])
    setEventLoading(false)
  }

  if (loading) return <PageLoader />

  const exportMembers = () => {
    downloadTextFile(
      'ciie-members-report.csv',
      toCsv(members.map((m) => ({ Name: m.full_name, 'CIIE ID': m.ciie_id, Department: m.department, Year: m.year_of_study, Team: m.team, Points: m.total_points, Worked: m.events_worked, Attended: m.events_attended, Volunteered: m.volunteer_activities, Achievements: m.achievements, Certificates: m.certificates }))),
      'text/csv',
    )
  }

  const exportEvents = () => {
    downloadTextFile(
      'ciie-events-report.csv',
      toCsv(events.map((e) => ({ Title: e.title, Status: e.status, Date: e.start_date, Registrations: e.registrations, Present: e.present, Absent: e.absent, Team: e.team_size, Certificates: e.certificates }))),
      'text/csv',
    )
  }

  const exportEventExcel = () => {
    const event = events.find((e) => e.event_id === selectedEventId)
    if (!event) return
    const presentByReg = new Map<string, { method: string; marked_at: string; marked_by: AttRow['marked_by'] }>()
    const presentByMember = new Map<string, { method: string; marked_at: string; marked_by: AttRow['marked_by'] }>()
    for (const a of attendance) {
      if (a.status !== 'present') continue
      const info = { method: a.method, marked_at: a.marked_at, marked_by: a.marked_by }
      if (a.registration?.registration_code) presentByReg.set(a.registration.registration_code, info)
      if (a.member_id) presentByMember.set(a.member_id, info)
    }
    const formKeys = collectFormKeys(regs)
    const registeredRows = regs.map((r, i) => {
      const present = presentByReg.get(r.registration_code) ?? (r.member_id ? presentByMember.get(r.member_id) : undefined)
      const row: Record<string, unknown> = {
        'S.No': i + 1,
        'Registration ID': r.registration_code,
        'Student ID': r.student_id ?? r.profile?.ciie_id ?? '—',
        Name: r.profile?.full_name ?? r.attendee_name,
        Email: r.email ?? '—',
        Phone: r.phone ?? '—',
        Department: r.department ?? '—',
        Year: r.year_of_study ?? '—',
        College: r.college ?? '—',
        'Registration status': r.status,
        Attendance: present ? 'Present' : 'Absent',
        Method: present?.method ?? '—',
        'Scanned by': present?.marked_by?.full_name ?? '—',
        'Scanned by CIIE ID': present?.marked_by?.ciie_id ?? '—',
        'Marked at': present ? formatDateTime(present.marked_at) : '—',
      }
      for (const key of formKeys) {
        row[labelize(key)] = r.form_data?.[key] ?? '—'
      }
      return row
    })
    const attendanceLogRows = attendance.map((a, i) => {
      const row: Record<string, unknown> = {
        'S.No': i + 1,
        'Registration ID': a.registration?.registration_code ?? '—',
        'Student ID': a.registration?.student_id ?? a.member?.ciie_id ?? '—',
        Name: a.member?.full_name ?? a.registration?.attendee_name ?? '—',
        Email: a.registration?.email ?? '—',
        Phone: a.registration?.phone ?? '—',
        Department: a.registration?.department ?? '—',
        Year: a.registration?.year_of_study ?? '—',
        College: a.registration?.college ?? '—',
        Round: a.round,
        Status: a.status,
        Method: a.method,
        'Scanned by': a.marked_by?.full_name ?? '—',
        'Scanned by CIIE ID': a.marked_by?.ciie_id ?? '—',
        'Marked at': formatDateTime(a.marked_at),
      }
      for (const key of formKeys) {
        row[labelize(key)] = a.registration?.form_data?.[key] ?? '—'
      }
      return row
    })
    const base = `event-report-${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
    downloadExcelSheets(`${base}-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      { name: 'Registered', rows: registeredRows },
      { name: 'Attendance Log', rows: attendanceLogRows },
    ])
  }

  const totalPoints = members.reduce((s, m) => s + m.total_points, 0)
  const formKeys = collectFormKeys(regs)

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Internal analytics covering all members (privacy settings do not apply here)."
        actions={
          <>
            <button className="btn-secondary" onClick={exportMembers}>
              <Download size={15} /> Members CSV
            </button>
            <button className="btn-secondary" onClick={exportEvents}>
              <Download size={15} /> Events CSV
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total members', value: members.length },
          { label: 'Total points awarded', value: totalPoints },
          { label: 'Total events', value: events.length },
          { label: 'Total registrations', value: events.reduce((s, e) => s + e.registrations, 0) },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card mb-6 p-5">
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
          <ClipboardList size={16} className="text-primary-600" /> Event report
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Select an event to view its registered list and the attendance (id, name, present/absent).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="max-w-md flex-1">
            <SelectInput value={selectedEventId} onChange={(e) => void loadEventReport(e.target.value)}>
              <option value="">Choose an event…</option>
              {events.map((e) => (
                <option key={e.event_id} value={e.event_id}>
                  {e.title} ({formatDate(e.start_date)})
                </option>
              ))}
            </SelectInput>
          </div>
          {selectedEventId && (
            <button className="btn-primary" onClick={exportEventExcel}>
              <FileSpreadsheet size={15} /> Download Excel
            </button>
          )}
        </div>

        {eventLoading && (
          <div className="mt-4">
            <PageLoader />
          </div>
        )}

        {!eventLoading && selectedEventId && (
          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Registered list ({regs.length})
              </h3>
              {regs.length === 0 ? (
                <EmptyState icon={<FileSpreadsheet size={36} />} title="No registrations" />
              ) : (
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-2">ID</th>
                      <th className="px-4 py-2">Student ID</th>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Department</th>
                      <th className="px-4 py-2">Year</th>
                      {formKeys.map((k) => (
                        <th key={k} className="px-4 py-2">{labelize(k)}</th>
                      ))}
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {regs.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.registration_code}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.student_id ?? r.profile?.ciie_id ?? '—'}</td>
                        <td className="px-4 py-2 font-semibold text-slate-900">{r.profile?.full_name ?? r.attendee_name}</td>
                        <td className="px-4 py-2 text-slate-600">{r.email ?? '—'}</td>
                        <td className="px-4 py-2 text-slate-600">{r.department ?? '—'}</td>
                        <td className="px-4 py-2 text-slate-600">{r.year_of_study ?? '—'}</td>
                        {formKeys.map((k) => (
                          <td key={k} className="px-4 py-2 text-slate-600">{String(r.form_data?.[k] ?? '—')}</td>
                        ))}
                        <td className="px-4 py-2">
                          <Badge tone={r.status === 'cancelled' ? 'red' : r.status === 'pending' ? 'slate' : 'green'}>
                            {r.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Attendance ({attendance.length})
              </h3>
              {attendance.length === 0 ? (
                <EmptyState icon={<CheckCircle2 size={36} />} title="No attendance marked yet" />
              ) : (
                <table className="w-full min-w-[1000px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-2">ID</th>
                      <th className="px-4 py-2">Student ID</th>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Email</th>
                      <th className="px-4 py-2">Department</th>
                      <th className="px-4 py-2">Year</th>
                      {formKeys.map((k) => (
                        <th key={k} className="px-4 py-2">{labelize(k)}</th>
                      ))}
                      <th className="px-4 py-2">Round</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Method</th>
                      <th className="px-4 py-2">Marked by</th>
                      <th className="px-4 py-2">Marked at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendance.map((a) => {
                      const name = a.member?.full_name ?? a.registration?.attendee_name ?? '—'
                      const id = a.registration?.registration_code ?? a.member?.ciie_id ?? a.id.slice(0, 8)
                      const studentId = a.registration?.student_id ?? a.member?.ciie_id ?? '—'
                      const present = a.status === 'present'
                      return (
                        <tr key={a.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-mono text-xs text-slate-500">{id}</td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-500">{studentId}</td>
                          <td className="px-4 py-2 font-semibold text-slate-900">{name}</td>
                          <td className="px-4 py-2 text-slate-600">{a.registration?.email ?? '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{a.registration?.department ?? '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{a.registration?.year_of_study ?? '—'}</td>
                          {formKeys.map((k) => (
                            <td key={k} className="px-4 py-2 text-slate-600">{String(a.registration?.form_data?.[k] ?? '—')}</td>
                          ))}
                          <td className="px-4 py-2 text-slate-600">Round {a.round}</td>
                          <td className="px-4 py-2">
                            {present ? (
                              <span className={cn('inline-flex items-center gap-1 font-semibold text-green-600')}>
                                <CheckCircle2 size={14} /> Present
                              </span>
                            ) : (
                              <span className={cn('inline-flex items-center gap-1 font-semibold text-red-600')}>
                                <XCircle size={14} /> {a.status}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-slate-600">{a.method}</td>
                          <td className="px-4 py-2 text-slate-600">
                            {a.marked_by?.full_name ?? '—'}
                            {a.marked_by?.ciie_id && <span className="block text-xs text-slate-400">{a.marked_by.ciie_id}</span>}
                          </td>
                          <td className="px-4 py-2 text-slate-500">{formatDateTime(a.marked_at)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 font-bold text-slate-900">
            <FileSpreadsheet size={16} className="text-primary-600" /> Member leaderboard ({members.length})
          </h2>
          {members.length === 0 ? (
            <EmptyState icon={<BarChart3 size={40} />} title="No data" />
          ) : (
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2">Member</th>
                  <th className="px-5 py-2 text-right">Points</th>
                  <th className="px-5 py-2 text-right">Worked</th>
                  <th className="px-5 py-2 text-right">Attended</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.slice(0, 25).map((m, i) => (
                  <tr key={m.member_id} className="hover:bg-slate-50">
                    <td className="px-5 py-2">
                      <p className="font-semibold text-slate-900">
                        <span className="mr-2 text-slate-300">{i + 1}</span>
                        {m.full_name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {m.ciie_id ?? ''} {m.team ? `• ${m.team}` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-2 text-right font-bold text-primary-700">{m.total_points}</td>
                    <td className="px-5 py-2 text-right text-slate-600">{m.events_worked}</td>
                    <td className="px-5 py-2 text-right text-slate-600">{m.events_attended}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card overflow-x-auto">
          <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 font-bold text-slate-900">
            <BarChart3 size={16} className="text-primary-600" /> Event stats ({events.length}) — click a row to view its report
          </h2>
          {events.length === 0 ? (
            <EmptyState icon={<BarChart3 size={40} />} title="No data" />
          ) : (
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2">Event</th>
                  <th className="px-5 py-2">Date</th>
                  <th className="px-5 py-2 text-right">Reg</th>
                  <th className="px-5 py-2 text-right">Present</th>
                  <th className="px-5 py-2 text-right">Team</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e) => (
                  <tr
                    key={e.event_id}
                    onClick={() => loadEventReport(e.event_id)}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-primary-50/50',
                      selectedEventId === e.event_id && 'bg-primary-50/70',
                    )}
                  >
                    <td className="px-5 py-2 font-semibold text-slate-900">{e.title}</td>
                    <td className="px-5 py-2 text-slate-500">{formatDate(e.start_date)}</td>
                    <td className="px-5 py-2 text-right text-slate-600">{e.registrations}</td>
                    <td className="px-5 py-2 text-right text-green-600">{e.present}</td>
                    <td className="px-5 py-2 text-right text-slate-600">{e.team_size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
