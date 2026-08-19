import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, MapPin, Pencil, Trash2, UserPlus, Users, Video } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Modal, PageLoader, SelectInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Attendance, Event, EventRegistration, Profile } from '@/lib/types'
import { errorMessage, formatDate } from '@/lib/utils'

interface EventStats {
  registrations: number
  present: number
  absent: number
  attendance_rounds: number
  team_size: number
  certificates: number
}

type RegRow = EventRegistration & { attendance?: Attendance[] | null }

function roundsOf(event: Event): number[] {
  return Array.from({ length: Math.max(1, event.attendance_rounds) }, (_, i) => i + 1)
}

export default function EventDetailAdmin() {
  const { isSuperAdmin } = useAuth()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [event, setEvent] = useState<Event | null>(null)
  const [stats, setStats] = useState<EventStats | null>(null)
  const [regs, setRegs] = useState<RegRow[]>([])
  const [tab, setTab] = useState<'overview' | 'registrations' | 'attendance'>('overview')
  const [selectedRound, setSelectedRound] = useState(1)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [users, setUsers] = useState<Profile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!id) return
    const [{ data: ev }, { data: statsData }, { data: regData }, { data: userData }] = await Promise.all([
      supabase.from('events').select('*').eq('id', id).maybeSingle(),
      supabase.rpc('admin_get_event_stats'),
      supabase
        .from('event_registrations')
        .select('*, attendance:attendance(*)')
        .eq('event_id', id)
        .order('created_at', { ascending: false }),
      isSuperAdmin
        ? supabase.from('profiles').select('*').neq('status', 'disabled').order('full_name')
        : Promise.resolve({ data: null }),
    ])
    setEvent((ev ?? null) as Event | null)
    const s = ((statsData ?? []) as Array<{ event_id: string } & EventStats>).find((r) => r.event_id === id)
    setStats(s ?? null)
    setRegs((regData ?? []) as unknown as RegRow[])
    setUsers((userData ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isSuperAdmin])

  const registerUser = async () => {
    if (!event || !selectedUserId) return
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('admin_register_event_user', {
      p_event_id: event.id,
      p_member_id: selectedUserId,
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    setRegistrationOpen(false)
    setSelectedUserId('')
    await load()
  }

  const cancelReg = async (reg: RegRow) => {
    setConfirming(reg.id)
    const { error } = await supabase.from('event_registrations').update({ status: 'cancelled' }).eq('id', reg.id)
    setConfirming(null)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Registration Cancelled', p_entity_type: 'registration', p_entity_id: reg.id })
    load()
  }

  const restoreReg = async (reg: RegRow) => {
    setConfirming(reg.id)
    const { error } = await supabase.from('event_registrations').update({ status: 'confirmed' }).eq('id', reg.id)
    setConfirming(null)
    if (error) {
      setError(errorMessage(error))
      return
    }
    load()
  }

  const attendanceOf = (r: RegRow, round: number): Attendance | undefined =>
    (r.attendance ?? []).find((a) => a.round === round)

  const markAttendance = async (reg: RegRow, status: 'present' | 'absent') => {
    setBusy(true)
    const { error } = await supabase.rpc('admin_set_attendance', {
      p_event_id: event!.id,
      p_registration_id: reg.id,
      p_round: selectedRound,
      p_status: status,
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    load()
  }

  const deleteEvent = async () => {
    setBusy(true)
    const { error } = await supabase.from('events').delete().eq('id', event!.id)
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      setDeleteOpen(false)
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Event Deleted', p_entity_type: 'event', p_entity_id: event!.id })
    navigate('/admin/events')
  }

  const markCompleted = async () => {
    setBusy(true)
    const { error } = await supabase.from('events').update({ status: 'completed' }).eq('id', event!.id)
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Event Completed', p_entity_type: 'event', p_entity_id: event!.id })
    load()
  }

  if (loading) return <PageLoader />
  if (!event) {
    return <EmptyState icon={<CalendarDays size={40} />} title="Event not found" subtitle="It may have been deleted." />
  }

  const fields = (event.form_fields as unknown as Array<{ key: string; label: string; type: string; required?: boolean; options?: string[] }>) ?? []

  const tabs: Array<{ key: typeof tab; label: string; count?: number }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'registrations', label: 'Registrations', count: regs.length },
    { key: 'attendance', label: 'Attendance', count: regs.reduce((n, r) => n + (r.attendance?.length ?? 0), 0) },
  ]

  return (
    <div>
      <Link to="/admin/events" className="text-sm font-medium text-primary-600 hover:underline">
        ← All events
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{event.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <Badge tone={event.status === 'published' ? 'green' : event.status === 'completed' ? 'slate' : event.status === 'cancelled' ? 'red' : 'amber'}>
              {event.status}
            </Badge>
            <span className="flex items-center gap-1">
              <CalendarDays size={14} /> {formatDate(event.start_date)}
            </span>
            <span className="flex items-center gap-1">
              {event.mode === 'online' ? <Video size={14} /> : <MapPin size={14} />} {event.venue ?? event.mode}
            </span>
            <span className="flex items-center gap-1">
              <Users size={14} /> {stats?.registrations ?? 0} registered
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuperAdmin && (
            <Button variant="secondary" onClick={() => setRegistrationOpen(true)}>
              <UserPlus size={14} /> Register user
            </Button>
          )}
          <Link to={`/admin/attendance/${event.id}`} className="btn-secondary">
            Open scanner
          </Link>
          <Link to={`/admin/events/${event.id}/team`} className="btn-secondary">
            Manage team
          </Link>
          <Link to={`/admin/events/${event.id}/edit`} className="btn-secondary">
            <Pencil size={14} /> Edit
          </Link>
          {event.status === 'published' && (
            <Button variant="secondary" disabled={busy} onClick={markCompleted}>
              Mark completed
            </Button>
          )}
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: 'Registrations', value: stats?.registrations ?? 0 },
          { label: 'Present', value: stats?.present ?? 0 },
          { label: 'Absent', value: stats?.absent ?? 0 },
          { label: 'Team', value: stats?.team_size ?? 0 },
          { label: 'Certificates', value: stats?.certificates ?? 0 },
          { label: 'Rounds', value: event.attendance_rounds },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-xl font-extrabold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-1 gap-1 rounded-xl bg-slate-200/60 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                tab === t.key ? 'bg-white text-primary-700 shadow' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              {t.count !== undefined && <span className="ml-1 text-xs text-slate-400">({t.count})</span>}
            </button>
          ))}
        </div>
        {(tab === 'registrations' || tab === 'attendance') && event.attendance_rounds > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Round</span>
            {roundsOf(event).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSelectedRound(n)}
                className={`h-8 min-w-8 rounded-lg px-2 text-sm font-semibold ${
                  selectedRound === n ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {tab === 'overview' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="card space-y-4 p-6 lg:col-span-2">
            {event.banner_url && <img src={event.banner_url} alt={event.title} className="h-56 w-full rounded-xl object-cover" />}
            <div>
              <h2 className="text-base font-bold text-slate-900">Description</h2>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{event.description || 'No description provided.'}</p>
            </div>
            {event.coordinator_note && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Coordinator note</p>
                <p className="mt-1 text-sm text-amber-900">{event.coordinator_note}</p>
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-slate-900">Registration form fields</h2>
              {fields.length === 0 ? (
                <p className="mt-1 text-sm text-slate-400">Default fields only (name, email, phone, department, year, college).</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {fields.map((f) => (
                    <li key={f.key}>
                      • {f.label} <span className="text-xs text-slate-400">({f.type}{f.required ? ', required' : ''})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="card space-y-2 p-5 text-sm">
              <h3 className="font-bold text-slate-900">Event details</h3>
              {[
                ['Category', event.category],
                ['Mode', event.mode],
                ['Venue', event.venue ?? '—'],
                ['Start', event.start_time ? `${formatDate(event.start_date)} • ${event.start_time}` : formatDate(event.start_date)],
                ['End', event.end_date ? formatDate(event.end_date) : '—'],
                ['Registration deadline', event.registration_deadline ? formatDate(event.registration_deadline) : '—'],
                ['Seats', String(event.seats)],
                ['Registration enabled', event.registration_enabled ? 'Yes' : 'No'],
                ['Team public', event.show_team_public ? 'Yes' : 'No'],
                ['Slug', event.slug ?? '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span className="text-slate-400">{k}</span>
                  <span className="text-right font-medium text-slate-700">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'registrations' && (
        <div className="card mt-6 overflow-x-auto">
          {regs.length === 0 ? (
            <EmptyState title="No registrations yet" />
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">Attendee</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Attendance</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {regs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{r.attendee_name}</p>
                      <p className="text-xs text-slate-400">{r.department ?? '—'} {r.year_of_study ?? ''}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{r.email ?? '—'}</td>
                    <td className="px-5 py-3 text-xs font-mono text-slate-500">{r.registration_code}</td>
                    <td className="px-5 py-3">
                      <Badge tone={r.status === 'cancelled' ? 'red' : 'green'}>{r.status}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      {(() => {
                        const att = attendanceOf(r, selectedRound)
                        return att ? (
                          <Badge tone={att.status === 'present' ? 'green' : 'red'}>{att.status}</Badge>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )
                      })()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {r.status === 'cancelled' ? (
                          <Button variant="ghost" className="!px-2.5 !py-1" disabled={busy || confirming === r.id} onClick={() => restoreReg(r)}>
                            Restore
                          </Button>
                        ) : (
                          <Button variant="ghost" className="!px-2.5 !py-1" disabled={busy || confirming === r.id} onClick={() => cancelReg(r)}>
                            Cancel
                          </Button>
                        )}
                        {r.status !== 'cancelled' && (
                          <>
                            <Button variant="ghost" className="!px-2.5 !py-1 text-green-600" disabled={busy} onClick={() => markAttendance(r, 'present')}>
                              Present
                            </Button>
                            <Button variant="ghost" className="!px-2.5 !py-1 text-red-600" disabled={busy} onClick={() => markAttendance(r, 'absent')}>
                              Absent
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="card mt-6 overflow-x-auto">
          {regs.every((r) => !(r.attendance?.length)) ? (
            <EmptyState title="No attendance marked yet" subtitle="Scan QR tickets or mark attendance manually from the Registrations tab." />
          ) : (
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">Attendee</th>
                  <th className="px-5 py-3">Round</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Marked at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {regs.map((r) =>
                  roundsOf(event)
                    .map((n) => ({ att: attendanceOf(r, n), round: n }))
                    .filter((x): x is { att: Attendance; round: number } => !!x.att)
                    .map(({ att, round }) => (
                      <tr key={`${r.id}-${round}`} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-semibold text-slate-900">{r.attendee_name}</td>
                        <td className="px-5 py-3 text-slate-600">Round {round}</td>
                        <td className="px-5 py-3">
                          <Badge tone={att.status === 'present' ? 'green' : 'red'}>{att.status}</Badge>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{att.method}</td>
                        <td className="px-5 py-3 text-slate-600">{formatDate(att.marked_at)}</td>
                      </tr>
                    )),
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal
        open={registrationOpen}
        onClose={() => setRegistrationOpen(false)}
        title="Register user for this event"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRegistrationOpen(false)}>Cancel</Button>
            <Button disabled={busy || !selectedUserId} onClick={registerUser}>Register</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            This top-admin action can register a user even when the public registration deadline has passed. The event seat limit and duplicate-registration checks still apply.
          </p>
          <Field label="User">
            <SelectInput value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select a user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name || user.email || user.id}{user.email ? ` — ${user.email}` : ''}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete event?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy} onClick={deleteEvent}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This permanently deletes the event, its registrations, attendance and team. Points already awarded remain in the ledger.
        </p>
      </Modal>
    </div>
  )
}
