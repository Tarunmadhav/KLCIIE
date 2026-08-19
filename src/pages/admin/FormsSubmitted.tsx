import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, FileSpreadsheet, ListChecks, Search, Send } from 'lucide-react'
import { Badge, EmptyState, Modal, PageHeader, PageLoader, TextInput } from '@/components/ui'
import { downloadExcel } from '@/lib/excel'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS, type Profile, type Role } from '@/lib/types'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

type Tab = 'accounts' | 'events'
type ExportRowFilter = 'ALL' | 'PRESENT' | 'ABSENT'

interface ExportRequest {
  filename: string
  rows: Array<Record<string, unknown>>
  sheetName: string
}

interface EventRegRow {
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
  event: { title: string; start_date: string } | null
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

function collectKeys(rows: Array<Record<string, unknown>>, bucket: 'custom_fields' | 'form_data'): string[] {
  const keys = new Set<string>()
  for (const r of rows) {
    const obj = (r[bucket] ?? {}) as Record<string, unknown>
    for (const k of Object.keys(obj)) keys.add(k)
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

function SuperAdminExportDialog({ request, onClose }: { request: ExportRequest | null; onClose: () => void }) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [rowFilter, setRowFilter] = useState<ExportRowFilter>('ALL')
  const keys = useMemo(() => (request ? Array.from(new Set(request.rows.flatMap((row) => Object.keys(row)))) : []), [request])

  useEffect(() => {
    setSelectedKeys(keys)
    setRowFilter('ALL')
  }, [keys])

  const toggleKey = (key: string) => {
    setSelectedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
  }

  const exportSelected = () => {
    if (!request || selectedKeys.length === 0) return
    const rows = request.rows
      .filter((row) => {
        if (rowFilter === 'ALL') return true
        const status = String(row['Final Attendance'] ?? row.Status ?? row.status ?? '').toUpperCase()
        return rowFilter === 'PRESENT' ? status.includes('PRESENT') : status.includes('ABSENT')
      })
      .map((row) => Object.fromEntries(selectedKeys.map((key) => [key, row[key] ?? ''])))
    void downloadExcel(request.filename, rows, request.sheetName)
    onClose()
  }

  return (
    <Modal open={!!request} onClose={onClose} title="Choose Excel export details" wide footer={
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">{selectedKeys.length} of {keys.length} columns selected</span>
        <button className="btn-primary" onClick={exportSelected} disabled={selectedKeys.length === 0}>Download Excel</button>
      </div>
    }>
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Columns</p>
              <p className="text-xs text-slate-500">Select the fields you want in the spreadsheet.</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setSelectedKeys(keys)}>Select all</button>
              <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setSelectedKeys([])}>Clear all</button>
            </div>
          </div>
          <div className="grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            {keys.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-white">
                <input type="checkbox" checked={selectedKeys.includes(key)} onChange={() => toggleKey(key)} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
                <span>{key}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Rows</p>
          <p className="mb-2 text-xs text-slate-500">Choose which records should be downloaded.</p>
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'PRESENT', 'ABSENT'] as ExportRowFilter[]).map((filter) => (
              <label key={filter} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium', rowFilter === filter ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600')}>
                <input type="radio" name="forms-export-row-filter" checked={rowFilter === filter} onChange={() => setRowFilter(filter)} className="h-4 w-4 text-primary-600" />
                {filter === 'ALL' ? 'All rows' : filter === 'PRESENT' ? 'Present rows' : 'Absent rows'}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function FormsSubmitted() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('accounts')
  const [accounts, setAccounts] = useState<Profile[]>([])
  const [events, setEvents] = useState<EventRegRow[]>([])
  const [eventOptions, setEventOptions] = useState<Array<{ id: string; title: string; start_date: string }>>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedAccount, setSelectedAccount] = useState<Profile | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventRegRow | null>(null)
  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      const [acc, evt, opts] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase
          .from('event_registrations')
          .select(
            'id, event_id, member_id, attendee_name, student_id, email, phone, department, year_of_study, college, registration_code, form_data, status, created_at, event:events(title, start_date)',
          )
          .order('created_at', { ascending: false }),
        supabase.from('events').select('id, title, start_date').order('start_date', { ascending: false }),
      ])
      if (active) {
        setAccounts((acc.data ?? []) as Profile[])
        setEvents((evt.data ?? []) as unknown as EventRegRow[])
        setEventOptions((opts.data ?? []) as Array<{ id: string; title: string; start_date: string }>)
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const filteredAccounts = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((a) =>
      [a.full_name, a.email, a.student_id, a.ciie_id, a.phone, a.department, a.year_of_study]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [accounts, query])

  const filteredEvents = useMemo(() => {
    const byEvent = selectedEventId ? events.filter((r) => r.event_id === selectedEventId) : events
    const q = query.trim().toLowerCase()
    if (!q) return byEvent
    return byEvent.filter((r) =>
      [r.attendee_name, r.email, r.phone, r.registration_code, r.student_id, r.event?.title]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [events, query, selectedEventId])

  if (loading) return <PageLoader />

  const accountCustomKeys = collectKeys(accounts as unknown as Array<Record<string, unknown>>, 'custom_fields')
  const eventCustomKeys = collectKeys(filteredEvents as unknown as Array<Record<string, unknown>>, 'form_data')

  const buildAccountRow = (a: Profile, i: number): Record<string, unknown> => {
    const row: Record<string, unknown> = {
      'S.No': i + 1,
      'Full name': a.full_name ?? '',
      Email: a.email ?? '',
      'Student ID': a.student_id ?? '',
      'CIIE ID': a.ciie_id ?? '',
      Role: a.role ? ROLE_LABELS[a.role as Role] : '',
      Status: a.status ?? '',
      Phone: a.phone ?? '',
      Department: a.department ?? '',
      'Year of study': a.year_of_study ?? '',
      'Academic year': a.academic_year ?? '',
      Team: a.team ?? '',
      Domain: a.domain ?? '',
      'Submitted at': formatDateTime(a.created_at),
    }
    for (const key of accountCustomKeys) {
      row[labelize(key)] = (a.custom_fields ?? {})[key] ?? ''
    }
    return row
  }

  const buildEventRow = (r: EventRegRow, i: number): Record<string, unknown> => {
    const row: Record<string, unknown> = {
      'S.No': i + 1,
      Event: r.event?.title ?? '',
      'Event date': formatDate(r.event?.start_date),
      'Registration code': r.registration_code,
      Name: r.attendee_name,
      'Student ID': r.student_id ?? '',
      Email: r.email ?? '',
      Phone: r.phone ?? '',
      Department: r.department ?? '',
      'Year of study': r.year_of_study ?? '',
      College: r.college ?? '',
      Status: r.status,
      'Submitted at': formatDateTime(r.created_at),
    }
    for (const key of eventCustomKeys) {
      row[labelize(key)] = r.form_data[key] ?? ''
    }
    return row
  }

  const exportAll = () => {
    if (tab === 'accounts') {
      const request = {
        filename: `forms-submitted-accounts-${new Date().toISOString().slice(0, 10)}.xlsx`,
        rows: filteredAccounts.map((a, i) => buildAccountRow(a, i)),
        sheetName: 'Account registrations',
      }
      if (profile?.role === 'super_admin') setExportRequest(request)
      else void downloadExcel(request.filename, request.rows, request.sheetName)
    } else {
      const sel = eventOptions.find((e) => e.id === selectedEventId)
      const base = sel ? `form-${sel.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}` : 'forms-submitted-events'
      const request = {
        filename: `${base}-${new Date().toISOString().slice(0, 10)}.xlsx`,
        rows: filteredEvents.map((r, i) => buildEventRow(r, i)),
        sheetName: 'Event registrations',
      }
      if (profile?.role === 'super_admin') setExportRequest(request)
      else void downloadExcel(request.filename, request.rows, request.sheetName)
    }
  }

  const exportOne = (kind: Tab, item: Profile | EventRegRow) => {
    if (kind === 'accounts') {
      const request = { filename: `form-${(item as Profile).full_name ?? 'submission'}.xlsx`, rows: [buildAccountRow(item as Profile, 1)], sheetName: 'Submission' }
      if (profile?.role === 'super_admin') setExportRequest(request)
      else void downloadExcel(request.filename, request.rows, request.sheetName)
    } else {
      const request = { filename: `form-${(item as EventRegRow).registration_code}.xlsx`, rows: [buildEventRow(item as EventRegRow, 1)], sheetName: 'Submission' }
      if (profile?.role === 'super_admin') setExportRequest(request)
      else void downloadExcel(request.filename, request.rows, request.sheetName)
    }
  }

  const accountDetailItems = (a: Profile): DetailItem[] => [
    { label: 'Full name', value: a.full_name, full: true },
    { label: 'Email', value: a.email, full: true },
    { label: 'Student ID', value: a.student_id, mono: true },
    { label: 'CIIE ID', value: a.ciie_id, mono: true },
    { label: 'Role', value: a.role ? ROLE_LABELS[a.role as Role] : '' },
    {
      label: 'Status',
      value: a.status ? <Badge tone={a.status === 'active' ? 'green' : a.status === 'disabled' ? 'red' : a.status === 'pending' ? 'slate' : 'amber'}>{a.status}</Badge> : '',
    },
    { label: 'Phone', value: a.phone, mono: true },
    { label: 'Department', value: a.department },
    { label: 'Year of study', value: a.year_of_study },
    { label: 'Academic year', value: a.academic_year },
    { label: 'Team', value: a.team },
    { label: 'Domain', value: a.domain },
    { label: 'Submitted at', value: formatDateTime(a.created_at) },
    ...(accountCustomKeys.map((key) => ({
      label: labelize(key),
      value: (a.custom_fields ?? {})[key] ?? '',
      full: true,
    })) as DetailItem[]),
  ]

  const eventDetailItems = (r: EventRegRow): DetailItem[] => [
    { label: 'Event', value: r.event?.title, full: true },
    { label: 'Event date', value: formatDate(r.event?.start_date) },
    { label: 'Registration code', value: r.registration_code, mono: true },
    { label: 'Name', value: r.attendee_name, full: true },
    { label: 'Student ID', value: r.student_id, mono: true },
    { label: 'Email', value: r.email, full: true },
    { label: 'Phone', value: r.phone, mono: true },
    { label: 'Department', value: r.department },
    { label: 'Year of study', value: r.year_of_study },
    { label: 'College', value: r.college },
    {
      label: 'Status',
      value: r.status ? <Badge tone={r.status === 'confirmed' ? 'green' : r.status === 'cancelled' ? 'red' : 'slate'}>{r.status}</Badge> : '',
    },
    { label: 'Submitted at', value: formatDateTime(r.created_at) },
    ...(eventCustomKeys.map((key) => ({
      label: labelize(key),
      value: r.form_data[key] ?? '',
      full: true,
    })) as DetailItem[]),
  ]

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'accounts', label: 'Account registrations', count: accounts.length },
    { id: 'events', label: 'Event registrations', count: events.length },
  ]

  return (
    <div>
      <PageHeader
        title="Forms Submitted"
        subtitle="Every response submitted through the registration forms — account signups and event registrations. Every collected field is included in the Excel download."
        actions={
          tab === 'accounts' ? (
            <button className="btn-primary" onClick={exportAll}>
              <FileSpreadsheet size={15} /> Download Excel
            </button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-semibold transition',
                tab === t.id ? 'bg-primary-600 text-white' : 'text-slate-500 hover:text-slate-900',
              )}
            >
              {t.label}
              <span className={cn('ml-1.5 text-xs', tab === t.id ? 'text-primary-200' : 'text-slate-400')}>{t.count}</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <TextInput
            className="!pl-9"
            placeholder="Search by name, email, ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {tab === 'accounts' && (
        <div className="card overflow-x-auto">
          <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 font-bold text-slate-900">
            <Send size={16} className="text-primary-600" /> Join CIIE &amp; role registration forms ({filteredAccounts.length})
          </h2>
          {filteredAccounts.length === 0 ? (
            <EmptyState icon={<ListChecks size={36} />} title="No account registrations found" />
          ) : (
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2">Name</th>
                  <th className="px-5 py-2">Email</th>
                  <th className="px-5 py-2">Student ID</th>
                  <th className="px-5 py-2">Role</th>
                  <th className="px-5 py-2">Status</th>
                  <th className="px-5 py-2">Department</th>
                  <th className="px-5 py-2">Year</th>
                  <th className="px-5 py-2">Submitted at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map((a) => (
                  <tr key={a.id} onClick={() => setSelectedAccount(a)} className="cursor-pointer transition-colors hover:bg-primary-50/50">
                    <td className="px-5 py-2 font-semibold text-slate-900">{a.full_name}</td>
                    <td className="px-5 py-2 text-slate-600">{a.email}</td>
                    <td className="px-5 py-2 font-mono text-xs text-slate-500">{a.student_id ?? '—'}</td>
                    <td className="px-5 py-2 text-slate-600">{a.role ? ROLE_LABELS[a.role as Role] : '—'}</td>
                    <td className="px-5 py-2">
                      <Badge tone={a.status === 'active' ? 'green' : a.status === 'disabled' ? 'red' : a.status === 'pending' ? 'slate' : 'amber'}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-2 text-slate-600">{a.department ?? '—'}</td>
                    <td className="px-5 py-2 text-slate-600">{a.year_of_study ?? '—'}</td>
                    <td className="px-5 py-2 text-slate-500">{formatDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:max-w-md">
              <ListChecks size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                className="input !pl-9"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                <option value="">Select an event to view its registrations…</option>
                {eventOptions.map((e) => {
                  const count = events.filter((r) => r.event_id === e.id).length
                  return (
                    <option key={e.id} value={e.id}>
                      {e.title} ({formatDate(e.start_date)}) — {count} registration{count === 1 ? '' : 's'}
                    </option>
                  )
                })}
              </select>
            </div>
            {selectedEventId && (
              <button className="btn-primary" onClick={exportAll}>
                <FileSpreadsheet size={15} /> Download Excel
              </button>
            )}
          </div>

          {!selectedEventId ? (
            <EmptyState
              icon={<ListChecks size={36} />}
              title="Choose an event first"
              subtitle="Pick an event from the list above to open every registration submitted for it — each with every single submitted detail."
            />
          ) : (
            <div className="card overflow-x-auto">
              <h2 className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 font-bold text-slate-900">
                <ListChecks size={16} className="text-primary-600" />
                {eventOptions.find((e) => e.id === selectedEventId)?.title ?? 'Event'} registrations ({filteredEvents.length})
              </h2>
              {filteredEvents.length === 0 ? (
                <EmptyState icon={<ListChecks size={36} />} title="No registrations for this event" />
              ) : (
                <table className="w-full min-w-[1100px] text-left text-sm">
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
                      {eventCustomKeys.map((k) => (
                        <th key={k} className="px-4 py-2">{labelize(k)}</th>
                      ))}
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Submitted at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEvents.map((r) => (
                      <tr key={r.id} onClick={() => setSelectedEvent(r)} className="cursor-pointer transition-colors hover:bg-primary-50/50">
                        <td className="px-4 py-2 font-semibold text-slate-900">{r.attendee_name}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.registration_code}</td>
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.student_id ?? '—'}</td>
                        <td className="px-4 py-2 text-slate-600">{r.email ?? '—'}</td>
                        <td className="px-4 py-2 text-slate-600">{r.phone ?? '—'}</td>
                        <td className="px-4 py-2 text-slate-600">{r.department ?? '—'}</td>
                        <td className="px-4 py-2 text-slate-600">{r.year_of_study ?? '—'}</td>
                        <td className="px-4 py-2 text-slate-600">{r.college ?? '—'}</td>
                        {eventCustomKeys.map((k) => (
                          <td key={k} className="px-4 py-2 text-slate-600">{String(r.form_data?.[k] ?? '—')}</td>
                        ))}
                        <td className="px-4 py-2">
                          <Badge tone={r.status === 'confirmed' ? 'green' : r.status === 'cancelled' ? 'red' : 'slate'}>{r.status}</Badge>
                        </td>
                        <td className="px-4 py-2 text-slate-500">{formatDateTime(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Click any row to view the complete submission. The Excel download includes every field collected on the form, including custom
        questions added later.
      </p>

      <SuperAdminExportDialog request={exportRequest} onClose={() => setExportRequest(null)} />

      <Modal
        open={!!selectedAccount}
        onClose={() => setSelectedAccount(null)}
        title={`Submission — ${selectedAccount?.full_name ?? ''}`}
        wide
        footer={
          selectedAccount && (
            <button className="btn-primary" onClick={() => exportOne('accounts', selectedAccount)}>
              <Download size={15} /> Download as Excel
            </button>
          )
        }
      >
        {selectedAccount && <DetailList items={accountDetailItems(selectedAccount)} />}
      </Modal>

      <Modal
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        title={`Submission — ${selectedEvent?.attendee_name ?? ''}`}
        wide
        footer={
          selectedEvent && (
            <button className="btn-primary" onClick={() => exportOne('events', selectedEvent)}>
              <Download size={15} /> Download as Excel
            </button>
          )
        }
      >
        {selectedEvent && <DetailList items={eventDetailItems(selectedEvent)} />}
      </Modal>
    </div>
  )
}
