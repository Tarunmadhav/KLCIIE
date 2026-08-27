import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ClipboardCheck, Download, FileSpreadsheet, ScanLine, Search, Ticket } from 'lucide-react'
import { Badge, EmptyState, Modal, PageHeader, PageLoader, TextInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { downloadExcel } from '@/lib/excel'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/queries'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

interface EventOption {
  event_id: string
  title: string
  status: string
  start_date: string
  registrations: number
  present: number
  absent: number
  attendance_rounds: number
}

interface RegRow {
  id: string
  event_id: string
  member_id: string | null
  attendee_name: string
  student_id: string | null
  email: string | null
  phone: string | null
  department: string | null
  year_of_study: string | null
  college: string | null
  registration_code: string
  form_data: Record<string, unknown>
  status: string
  created_at: string
}

interface AttRow {
  id: string
  registration_id: string | null
  member_id: string | null
  round: number
  status: string
  method: string
  marked_at: string
  marked_by: { full_name: string | null; ciie_id: string | null; student_id: string | null } | null
}

interface AttendeeView extends RegRow {
  attendance: AttRow[]
}

interface DetailItem {
  label: string
  value: ReactNode
  mono?: boolean
  full?: boolean
}

function labelize(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function collectFormKeys(rows: RegRow[]): string[] {
  const keys = new Set<string>()
  for (const r of rows) {
    for (const k of Object.keys(r.form_data ?? {})) keys.add(k)
  }
  return Array.from(keys).sort()
}

function DetailList({ items }: { items: DetailItem[] }) {
  return (
    <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {items.map((it) => (
        <div key={it.label} className="grid gap-1 px-4 py-3 sm:grid-cols-3">
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{it.label}</dt>
          <dd className={cn('text-sm text-slate-800 sm:col-span-2', it.mono && 'font-mono text-xs', it.full && 'whitespace-pre-wrap')}>
            {it.value === '' || it.value === null || it.value === undefined ? '—' : it.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function AttendanceSubmitted() {
  const { profile } = useAuth()
  const isSuperAdmin = profile?.role === 'super_admin'
  const [eventOptions, setEventOptions] = useState<EventOption[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [rows, setRows] = useState<AttendeeView[]>([])
  const [event, setEvent] = useState<EventOption | null>(null)
  const [loading, setLoading] = useState(true)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AttendeeView | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportRowFilter, setExportRowFilter] = useState<'all' | 'present' | 'absent'>('all')
  const [exportColumns, setExportColumns] = useState<string[]>(['registration', 'identity', 'contact', 'academic', 'attendance', 'form'])

  useEffect(() => {
    let active = true
    supabase.rpc('admin_get_event_stats').then(({ data }) => {
      if (active) {
        setEventOptions((data ?? []) as EventOption[])
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const loadEvent = async (id: string) => {
    setSelectedEventId(id)
    setRows([])
    setSelected(null)
    const ev = eventOptions.find((e) => e.event_id === id) ?? null
    setEvent(ev)
    if (!id) return
    setRowsLoading(true)
    const [r, a] = await Promise.all([
      fetchAllRows<RegRow>(
        'event_registrations',
        'id, event_id, member_id, attendee_name, student_id, email, phone, department, year_of_study, college, registration_code, form_data, status, created_at',
        (q) => q.eq('event_id', id).order('created_at', { ascending: true }),
      ),
      fetchAllRows<AttRow>(
        'attendance',
        'id, registration_id, member_id, round, status, method, marked_at, marked_by:profiles!attendance_marked_by_fkey(full_name, ciie_id, student_id)',
        (q) => q.eq('event_id', id).order('marked_at', { ascending: true }),
      ),
    ])
    const regs = r as RegRow[]
    const atts = a as AttRow[]
    const byReg = new Map<string, AttRow[]>()
    const byMember = new Map<string, AttRow[]>()
    for (const at of atts) {
      if (at.registration_id) {
        if (!byReg.has(at.registration_id)) byReg.set(at.registration_id, [])
        byReg.get(at.registration_id)!.push(at)
      }
      if (at.member_id) {
        if (!byMember.has(at.member_id)) byMember.set(at.member_id, [])
        byMember.get(at.member_id)!.push(at)
      }
    }
    const merged: AttendeeView[] = regs.map((reg) => ({
      ...reg,
      attendance: byReg.get(reg.id) ?? (reg.member_id ? byMember.get(reg.member_id) ?? [] : []),
    }))
    setRows(merged)
    setRowsLoading(false)
  }

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.attendee_name, r.email, r.phone, r.registration_code, r.student_id]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [rows, query])

  if (loading) return <PageLoader />

  const formKeys = collectFormKeys(rows)
  const roundsCount = Math.max(1, event?.attendance_rounds ?? 1)
  const rounds = Array.from({ length: roundsCount }, (_, n) => n + 1)

  const roundAtt = (r: AttendeeView, round: number): AttRow | undefined =>
    r.attendance.find((a) => (a.round ?? 1) === round)

  const presentRounds = (r: AttendeeView): number => rounds.filter((n) => roundAtt(r, n)).length

  const finalPresent = (r: AttendeeView): boolean => roundsCount > 0 && presentRounds(r) === roundsCount

  const presentCount = rows.filter((r) => finalPresent(r)).length
  const absentCount = rows.length - presentCount

  const buildRow = (r: AttendeeView, i: number, columns = exportColumns): Record<string, unknown> => {
    const row: Record<string, unknown> = { 'S.No': i + 1 }
    if (columns.includes('registration')) {
      row['Registration code'] = r.registration_code
      row['Registration status'] = r.status
    }
    if (columns.includes('identity')) {
      row.Name = r.attendee_name
      row['Student ID'] = r.student_id ?? ''
    }
    if (columns.includes('contact')) {
      row.Email = r.email ?? ''
      row.Phone = r.phone ?? ''
    }
    if (columns.includes('academic')) {
      row.Department = r.department ?? ''
      row['Year of study'] = r.year_of_study ?? ''
      row.College = r.college ?? ''
    }
    if (columns.includes('attendance')) {
      for (const n of rounds) {
        const att = roundAtt(r, n)
        const present = !!att
        row[`Round ${n} Status`] = present ? 'Present' : 'Absent'
        row[`Round ${n} Method`] = present ? att?.method ?? '' : ''
        row[`Round ${n} Scanned by`] = present ? att?.marked_by?.full_name ?? '' : ''
        row[`Round ${n} Marked at`] = present ? formatDateTime(att?.marked_at) : ''
      }
      row['Final Attendance'] = finalPresent(r) ? 'Present' : 'Absent'
      row['No. of Present Rounds'] = presentRounds(r)
      row['No. of Absent Rounds'] = roundsCount - presentRounds(r)
    }
    if (columns.includes('form')) for (const key of formKeys) row[labelize(key)] = r.form_data?.[key] ?? ''
    return row
  }

  const exportExcel = () => {
    if (!selectedEventId) return
    if (isSuperAdmin) {
      setExportOpen(true)
      return
    }
    performExport()
  }

  const performExport = () => {
    if (!selectedEventId) return
    const exportRows = filteredRows.filter((r) => exportRowFilter === 'all' || (exportRowFilter === 'present' ? finalPresent(r) : !finalPresent(r)))
    downloadExcel(
      `attendance-${(event?.title ?? 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      exportRows.map((r, i) => buildRow(r, i)),
      'Attendance',
    )
    setExportOpen(false)
  }

  const detailItems = (r: AttendeeView): DetailItem[] => {
    const items: DetailItem[] = [
      { label: 'Event', value: event?.title, full: true },
      { label: 'Event date', value: formatDate(event?.start_date) },
      { label: 'Registration code', value: r.registration_code, mono: true },
      { label: 'Name', value: r.attendee_name, full: true },
      { label: 'Student ID', value: r.student_id, mono: true },
      { label: 'Email', value: r.email, full: true },
      { label: 'Phone', value: r.phone, mono: true },
      { label: 'Department', value: r.department },
      { label: 'Year of study', value: r.year_of_study },
      { label: 'College', value: r.college },
      {
        label: 'Registration status',
        value: <Badge tone={r.status === 'confirmed' ? 'green' : r.status === 'cancelled' ? 'red' : 'slate'}>{r.status}</Badge>,
      },
      ...(formKeys.map((key) => ({
        label: labelize(key),
        value: r.form_data?.[key] ?? '',
        full: true,
      })) as DetailItem[]),
    ]
    for (const n of rounds) {
      const att = roundAtt(r, n)
      const present = !!att
      items.push({
        label: `Round ${n}`,
        value: present ? <Badge tone="green">Present</Badge> : <Badge tone="slate">Absent</Badge>,
      })
      if (present) {
        items.push({ label: `R${n} Method`, value: att?.method ?? '' })
        items.push({ label: `R${n} Marked at`, value: formatDateTime(att?.marked_at) })
        items.push({ label: `R${n} Scanned by Student Name`, value: att?.marked_by?.full_name })
        items.push({ label: `R${n} Scanned by CIIE ID`, value: att?.marked_by?.ciie_id, mono: true })
        items.push({ label: `R${n} Scanned by Student ID`, value: att?.marked_by?.student_id, mono: true })
      }
    }
    items.push(
      {
        label: 'Final Attendance',
        value: finalPresent(r) ? <Badge tone="green">Present</Badge> : <Badge tone="slate">Absent</Badge>,
      },
      { label: 'No. of Present Rounds', value: presentRounds(r) },
      { label: 'No. of Absent Rounds', value: roundsCount - presentRounds(r) },
    )
    return items
  }

  return (
    <div>
      <PageHeader
        title="Attendance Records"
        subtitle="Select an event to see every registered student with all the details they submitted, per-round attendance (absent by default, present if a QR was scanned), who scanned them, and the final attendance."
        actions={
          selectedEventId ? (
            <button className="btn-primary" onClick={exportExcel}>
              <FileSpreadsheet size={15} /> Download Excel
            </button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-md">
          <ScanLine size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select className="input !pl-9" value={selectedEventId} onChange={(e) => void loadEvent(e.target.value)}>
            <option value="">Select an event…</option>
            {eventOptions.map((e) => (
              <option key={e.event_id} value={e.event_id}>
                {e.title} ({formatDate(e.start_date)}) — {e.registrations} registered, {e.present} present
              </option>
            ))}
          </select>
        </div>
        {selectedEventId && (
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <TextInput
              className="!pl-9"
              placeholder="Search by name, email, ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {!selectedEventId ? (
        <EmptyState
          icon={<Ticket size={36} />}
          title="Choose an event first"
          subtitle="Pick an event above to open every registered student with all their submitted details and attendance status."
        />
      ) : rowsLoading ? (
        <PageLoader />
      ) : (
        <div>
          <div className="mb-4 grid grid-cols-3 gap-4 sm:max-w-md">
            <div className="card p-4 text-center">
              <p className="text-2xl font-extrabold text-slate-900">{rows.length}</p>
              <p className="text-xs text-slate-500">Registered</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-extrabold text-green-700">{presentCount}</p>
              <p className="text-xs text-slate-500">Present (all rounds)</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-extrabold text-red-600">{absentCount}</p>
              <p className="text-xs text-slate-500">Absent</p>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 font-bold text-slate-900">
              <ClipboardCheck size={16} className="text-primary-600" /> {event?.title ?? 'Event'} — registered students ({filteredRows.length})
            </h2>
            {filteredRows.length === 0 ? (
              <EmptyState icon={<Ticket size={36} />} title="No registrations for this event" />
            ) : (
              <table className="w-full text-left text-sm" style={{ minWidth: 1100 + roundsCount * 250 }}>
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Registration code</th>
                    <th className="px-4 py-2">Student ID</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Phone</th>
                    <th className="px-4 py-2">Department</th>
                    <th className="px-4 py-2">Year</th>
                    <th className="px-4 py-2">College</th>
                    {formKeys.map((k) => (
                      <th key={k} className="px-4 py-2">{labelize(k)}</th>
                    ))}
                    <th className="px-4 py-2">Reg. status</th>
                    {rounds.map((n) => (
                      <Fragment key={n}>
                        <th className="px-4 py-2">Round {n}</th>
                        <th className="px-4 py-2">R{n} Scanned by</th>
                        <th className="px-4 py-2">R{n} Type</th>
                        <th className="px-4 py-2">R{n} Marked at</th>
                      </Fragment>
                    ))}
                    <th className="px-4 py-2">Final Attendance</th>
                    <th className="px-4 py-2">Present Rounds</th>
                    <th className="px-4 py-2">Absent Rounds</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((r) => (
                    <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer transition-colors hover:bg-primary-50/50">
                      <td className="px-4 py-2 font-semibold text-slate-900">{r.attendee_name}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.registration_code}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.student_id ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{r.email ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{r.phone ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{r.department ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{r.year_of_study ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{r.college ?? '—'}</td>
                      {formKeys.map((k) => (
                        <td key={k} className="px-4 py-2 text-slate-600">{String(r.form_data?.[k] ?? '—')}</td>
                      ))}
                      <td className="px-4 py-2">
                        <Badge tone={r.status === 'confirmed' ? 'green' : r.status === 'cancelled' ? 'red' : 'slate'}>{r.status}</Badge>
                      </td>
                      {rounds.map((n) => {
                        const att = roundAtt(r, n)
                        const present = !!att
                        return (
                          <Fragment key={n}>
                            <td className="px-4 py-2">
                              {present ? <Badge tone="green">Present</Badge> : <Badge tone="slate">Absent</Badge>}
                            </td>
                            <td className="px-4 py-2">
                              {present ? (
                                <div>
                                  <span className="text-slate-800">{att?.marked_by?.full_name ?? '—'}</span>
                                  {(att?.marked_by?.ciie_id || att?.marked_by?.student_id) && (
                                    <span className="block font-mono text-[10px] text-slate-400">
                                      {att?.marked_by?.ciie_id ?? ''}
                                      {att?.marked_by?.ciie_id && att?.marked_by?.student_id ? ' · ' : ''}
                                      {att?.marked_by?.student_id ?? ''}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-2 text-slate-600">{present ? att?.method ?? '—' : '—'}</td>
                            <td className="px-4 py-2 text-slate-500">{present ? formatDateTime(att?.marked_at) : '—'}</td>
                          </Fragment>
                        )
                      })}
                      <td className="px-4 py-2">
                        {finalPresent(r) ? <Badge tone="green">Present</Badge> : <Badge tone="slate">Absent</Badge>}
                      </td>
                      <td className="px-4 py-2 font-semibold text-green-700">{presentRounds(r)}</td>
                      <td className="px-4 py-2 font-semibold text-red-600">{roundsCount - presentRounds(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Attendance is Absent by default and turns Present when a CIIE member or admin scans the student's QR for that round. Final
            attendance is Present only when the student is present in all {roundsCount === 1 ? 'round' : `${roundsCount} rounds`}. Click a row
            for the full submission and scan details.
          </p>
        </div>
      )}

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Choose Excel export fields"
        footer={<><button className="btn-secondary" onClick={() => setExportOpen(false)}>Cancel</button><button className="btn-primary" onClick={performExport}>Download Excel</button></>}
      >
        <div className="space-y-5 text-sm">
          <label className="block"><span className="label">Rows</span><select className="input" value={exportRowFilter} onChange={(e) => setExportRowFilter(e.target.value as typeof exportRowFilter)}><option value="all">All registered rows</option><option value="present">Present rows only</option><option value="absent">Absent rows only</option></select></label>
          <div><p className="label">Columns</p><div className="grid gap-2 sm:grid-cols-2">{[
            ['registration', 'Registration'], ['identity', 'Name and student ID'], ['contact', 'Email and phone'], ['academic', 'Department, year and college'], ['attendance', 'Attendance rounds'], ['form', 'Submitted form fields'],
          ].map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={exportColumns.includes(key)} onChange={(e) => setExportColumns((current) => e.target.checked ? [...current, key] : current.filter((x) => x !== key))} />{label}</label>)}</div></div>
        </div>
      </Modal>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Attendance — ${selected?.attendee_name ?? ''}`}
        wide
        footer={
          selected ? (
            <button className="btn-primary" onClick={() => downloadExcel(`attendance-${selected.registration_code}.xlsx`, [buildRow(selected, 1)], 'Attendance', { superAdmin: profile?.role === 'super_admin' })}>
              <Download size={15} /> Download as Excel
            </button>
          ) : undefined
        }
      >
        {selected && <DetailList items={detailItems(selected)} />}
      </Modal>
    </div>
  )
}
