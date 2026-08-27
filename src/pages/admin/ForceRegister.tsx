import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, MapPin, UserCheck, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAllProfiles } from '@/lib/queries'
import type { Event, Profile } from '@/lib/types'
import { Badge, Button, EmptyState, Modal, PageHeader, PageLoader, TextInput } from '@/components/ui'
import { errorMessage, formatDate } from '@/lib/utils'
import { isAdminRole, isSuperAdminRole } from '@/lib/types'

type ForceResult = { ok: boolean; error?: string }
type ApiRow = { member_id: string; ok: boolean; error?: string }
type PickerProfile = Pick<Profile, 'id' | 'full_name' | 'email' | 'ciie_id' | 'student_id' | 'role' | 'status' | 'department'>

const QUICK_PICKS: Array<{ value: string; label: string }> = [
  { value: 'users', label: 'Select all users' },
  { value: 'members', label: 'Select all members' },
  { value: 'faculty', label: 'Select all faculty' },
  { value: 'admins', label: 'Select all admins' },
  { value: 'super_admins', label: 'Select super admins' },
]

const STATUS_TONES: Record<string, 'green' | 'slate' | 'amber' | 'red'> = {
  published: 'green',
  completed: 'slate',
  draft: 'amber',
  cancelled: 'red',
}

export default function ForceRegister() {
  const [events, setEvents] = useState<Event[] | null>(null)
  const [regCounts, setRegCounts] = useState<Record<string, number>>({})
  const [pageError, setPageError] = useState('')

  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [unregistered, setUnregistered] = useState<PickerProfile[] | null>(null)
  const [modalError, setModalError] = useState('')
  const [search, setSearch] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Record<string, ForceResult>>({})
  const [busy, setBusy] = useState(false)

  const loadEvents = useCallback(async () => {
    setPageError('')
    const [{ data: eventsData, error: evErr }, { data: regsData }] = await Promise.all([
      supabase.from('events').select('*').order('start_date', { ascending: false }),
      supabase.from('event_registrations').select('event_id').neq('status', 'cancelled'),
    ])
    if (evErr) {
      setPageError(errorMessage(evErr))
      setEvents([])
      return
    }
    const counts: Record<string, number> = {}
    for (const r of regsData ?? []) counts[r.event_id] = (counts[r.event_id] ?? 0) + 1
    setRegCounts(counts)
    setEvents(eventsData ?? [])
  }, [])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const openEvent = async (ev: Event) => {
    setActiveEvent(ev)
    setModalError('')
    setSearch('')
    setChecked(new Set())
    setResults({})
    setUnregistered(null)
    const [{ data: regsData, error: regErr }, profilesData] = await Promise.all([
      supabase.from('event_registrations').select('member_id').eq('event_id', ev.id).neq('status', 'cancelled'),
      fetchAllProfiles<PickerProfile>('id, full_name, email, ciie_id, student_id, role, status, department', (q) =>
        q.neq('status', 'disabled').order('full_name'),
      ),
    ])
    if (regErr) {
      setModalError(errorMessage(regErr))
      setUnregistered([])
      return
    }
    const registeredIds = new Set((regsData ?? []).map((r) => r.member_id).filter(Boolean) as string[])
    setUnregistered((profilesData as PickerProfile[]).filter((p) => !registeredIds.has(p.id)))
  }

  const closeModal = () => {
    setActiveEvent(null)
    setUnregistered(null)
    setChecked(new Set())
    setResults({})
    setSearch('')
    setModalError('')
    if (Object.values(results).some((r) => r.ok)) void loadEvents()
  }

  const filtered = useMemo(() => {
    if (!unregistered) return []
    const q = search.trim().toLowerCase()
    if (!q) return unregistered
    return unregistered.filter((p) =>
      [p.full_name, p.email, p.ciie_id, p.student_id, p.department].some((v) =>
        (v ?? '').toLowerCase().includes(q),
      ),
    )
  }, [unregistered, search])

  const selectable = useMemo(() => filtered.filter((p) => !results[p.id]), [filtered, results])

  const allChecked = selectable.length > 0 && selectable.every((p) => checked.has(p.id))

  const toggleAll = () => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (allChecked) for (const p of selectable) next.delete(p.id)
      else for (const p of selectable) next.add(p.id)
      return next
    })
  }

  const toggleOne = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applyRolePick = (kind: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      for (const p of selectable) {
        const match =
          kind === 'users'
            ? p.role === 'user'
            : kind === 'members'
              ? p.role === 'member' || p.role === 'member_ciie'
              : kind === 'faculty'
                ? p.role === 'faculty'
                : kind === 'admins'
                  ? isAdminRole(p.role) && !isSuperAdminRole(p.role)
                  : isSuperAdminRole(p.role)
        if (match) next.add(p.id)
      }
      return next
    })
  }

  const clearSelection = () => setChecked(new Set())

  const submit = async () => {
    if (!activeEvent || selectable.length === 0) return
    setBusy(true)
    setModalError('')
    const ids = Array.from(checked).filter((id) => !results[id])
    const { data, error } = await supabase.rpc('admin_force_register_event_users', {
      p_event_id: activeEvent.id,
      p_member_ids: ids,
    })
    setBusy(false)
    if (error) {
      setModalError(errorMessage(error))
      return
    }
    const api = data as { results?: ApiRow[] } | null
    const rows: ApiRow[] = api?.results ?? []
    setResults((prev) => {
      const next = { ...prev }
      for (const r of rows) next[r.member_id] = { ok: !!r.ok, error: r.ok ? undefined : r.error ?? 'Failed' }
      return next
    })
    setChecked(new Set())
  }

  const resultRows = Object.entries(results)
  const okCount = resultRows.filter(([, r]) => r.ok).length
  const failCount = resultRows.length - okCount
  const done = resultRows.length > 0

  if (!events) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Force Register"
        subtitle="Pick an event and register members who missed out. They get a normal confirmed ticket with QR attendance."
      />
      {pageError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{pageError}</p>
      )}

      {events.length === 0 ? (
        <EmptyState icon={<CalendarDays size={40} />} title="No events yet" subtitle="Create an event first." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((ev) => {
            const used = regCounts[ev.id] ?? 0
            const blocked = ev.status === 'draft' || ev.status === 'cancelled'
            const full = used >= ev.seats
            return (
              <div key={ev.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold leading-snug text-slate-900">{ev.title}</h3>
                  <Badge tone={STATUS_TONES[ev.status] ?? 'slate'}>{ev.status}</Badge>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-slate-500">
                  <p className="flex items-center gap-1.5">
                    <CalendarDays size={15} /> {formatDate(ev.start_date)}
                    {ev.start_time ? ` · ${ev.start_time}` : ''}
                  </p>
                  {ev.venue && (
                    <p className="flex items-center gap-1.5">
                      <MapPin size={15} /> {ev.venue}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <Users size={15} /> {used} / {ev.seats} registered{full ? ' · Full' : ''}
                  </p>
                </div>
                <div className="mt-4 flex-1" />
                <Button disabled={blocked} onClick={() => void openEvent(ev)}>
                  <span className="inline-flex items-center gap-1.5">
                    <UserCheck size={16} /> Select members
                  </span>
                </Button>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={!!activeEvent}
        onClose={closeModal}
        wide
        title={`Force Register — ${activeEvent?.title ?? ''}`}
        footer={
          <>
            <span className="mr-auto text-xs text-slate-500">
              {!done && unregistered
                ? `${checked.size} selected · ${unregistered.length - resultRows.length} not registered`
                : okCount > 0
                  ? `${okCount} registered${failCount ? ` · ${failCount} failed` : ''}`
                  : ''}
            </span>
            <Button variant="ghost" onClick={closeModal}>
              {done ? 'Close' : 'Cancel'}
            </Button>
            {!done && (
              <Button disabled={busy || checked.size === 0} onClick={() => void submit()}>
                {busy ? 'Registering…' : `Force Register${checked.size ? ` (${checked.size})` : ''}`}
              </Button>
            )}
          </>
        }
      >
        {modalError && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p>
        )}
        {done && okCount > 0 && (
          <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
            {okCount} member{okCount === 1 ? '' : 's'} force registered. Their QR tickets are live in their accounts now.
          </p>
        )}
        {done && failCount > 0 && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">{failCount} row(s) were skipped — reasons shown below.</p>
        )}

        {unregistered === null ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading members…</p>
        ) : unregistered.length === 0 && !done ? (
          <EmptyState icon={<UserCheck size={36} />} title="Everyone is already registered" subtitle="No pending members left for this event." />
        ) : (
          <>
            <TextInput
              type="search"
              placeholder="Search name, email, CIIE ID, student ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mt-3 space-y-2 border-b border-slate-200 pb-3">
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-primary-600" checked={allChecked} onChange={toggleAll} />
                  Select all shown
                </label>
                <span className="text-xs text-slate-500">{filtered.length} shown</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_PICKS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => applyRolePick(o.value)}
                    className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={checked.size === 0}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear selection
                </button>
              </div>
            </div>
            <ul className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
              {(filtered.length > 0 ? filtered : unregistered).map((p) => {
                const res = results[p.id]
                return (
                  <li key={p.id}>
                    {res ? (
                      <div className="flex items-center justify-between gap-3 px-1 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{p.full_name ?? p.email ?? p.id}</p>
                          <p className="truncate text-xs text-slate-500">
                            {[p.ciie_id, p.student_id, p.email].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {res.ok ? (
                          <Badge tone="green">Registered</Badge>
                        ) : (
                          <Badge tone="red">{res.error}</Badge>
                        )}
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center gap-3 px-1 py-2.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary-600"
                          checked={checked.has(p.id)}
                          onChange={() => toggleOne(p.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">
                            {p.full_name ?? p.email ?? p.id}
                            {p.role !== 'member' && (
                              <Badge tone="primary" className="ml-2">
                                {p.role}
                              </Badge>
                            )}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {[p.ciie_id, p.student_id, p.department, p.email].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </label>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </Modal>
    </div>
  )
}
