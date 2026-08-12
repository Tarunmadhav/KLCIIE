import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus, Trash2, UserPlus } from 'lucide-react'
import { Avatar, Badge, Button, EmptyState, Field, PageLoader, SelectInput, Toggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { Event, EventRole, EventTeamMember, Profile } from '@/lib/types'
import { errorMessage, formatDate } from '@/lib/utils'

type TeamRow = EventTeamMember & { member?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'ciie_id'> | null; role?: Pick<EventRole, 'id' | 'name' | 'category'> | null }

export default function EventTeam() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [roles, setRoles] = useState<EventRole[]>([])
  const [team, setTeam] = useState<TeamRow[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [search, setSearch] = useState('')
  const [memberId, setMemberId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [hours, setHours] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!id) return
    const [{ data: ev }, { data: roleData }, { data: teamData }, { data: memberData }] = await Promise.all([
      supabase.from('events').select('*').eq('id', id).maybeSingle(),
      supabase.from('event_roles').select('*').eq('is_active', true).order('display_order'),
      supabase
        .from('event_team_members')
        .select('*, member:profiles!inner(id, full_name, avatar_url, ciie_id), role:event_roles!inner(id, name, category)')
        .eq('event_id', id)
        .order('created_at'),
      supabase.from('profiles').select('id, full_name, ciie_id, department, status').eq('status', 'active').order('full_name'),
    ])
    setEvent((ev ?? null) as Event | null)
    setRoles((roleData ?? []) as EventRole[])
    setTeam((teamData ?? []) as TeamRow[])
    setMembers((memberData ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        (m.full_name ?? '').toLowerCase().includes(q) ||
        (m.ciie_id ?? '').toLowerCase().includes(q) ||
        (m.department ?? '').toLowerCase().includes(q),
    )
  }, [members, search])

  const addMember = async (e: FormEvent) => {
    e.preventDefault()
    if (!memberId || !roleId) {
      setError('Choose a member and a role.')
      return
    }
    setBusy(true)
    setError('')
    const { error } = await supabase.from('event_team_members').insert({
      event_id: id!,
      member_id: memberId,
      role_id: roleId,
      is_public: isPublic,
      hours_worked: Number(hours) || 0,
      notes: notes || null,
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase
      .rpc('log_admin_event', {
        p_action: 'Team Member Added',
        p_entity_type: 'event',
        p_entity_id: id,
        p_details: { member_id: memberId, role_id: roleId, hours_worked: Number(hours) || 0 },
      })
    setMemberId('')
    setRoleId('')
    setHours('')
    setNotes('')
    setSearch('')
    load()
  }

  const removeMember = async (row: TeamRow) => {
    setBusy(true)
    const { error } = await supabase.from('event_team_members').delete().eq('id', row.id)
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Team Member Removed', p_entity_type: 'event', p_entity_id: id })
    load()
  }

  const togglePublic = async (row: TeamRow, value: boolean) => {
    await supabase.from('event_team_members').update({ is_public: value }).eq('id', row.id)
    load()
  }

  if (loading) return <PageLoader />
  if (!event) return <EmptyState icon={<UserPlus size={40} />} title="Event not found" />

  return (
    <div>
      <Link to={`/admin/events/${id}`} className="text-sm font-medium text-primary-600 hover:underline">
        ← {event.title}
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Event Team</h1>
      <p className="mt-1 text-sm text-slate-500">
        Team assignments are the source of truth for &quot;events worked on&quot;. Points are awarded automatically based on the role.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card h-fit p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <UserPlus size={16} className="text-primary-600" /> Add member
          </h2>
          <form onSubmit={addMember} className="mt-4 space-y-4">
            <Field label="Search member">
              <input
                className="input"
                placeholder="Type to search…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setMemberId('')
                }}
              />
            </Field>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {filteredMembers.length === 0 && <p className="p-2 text-sm text-slate-400">No members match.</p>}
              {filteredMembers.slice(0, 30).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMemberId(m.id)
                    setSearch(m.full_name ?? '')
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-primary-50 ${
                    memberId === m.id ? 'bg-primary-50 text-primary-700' : 'text-slate-700'
                  }`}
                >
                  <Avatar name={m.full_name} src={m.avatar_url} className="h-6 w-6 text-[10px]" />
                  <span className="min-w-0 flex-1 truncate">{m.full_name}</span>
                  <span className="text-[10px] text-slate-400">{m.ciie_id}</span>
                </button>
              ))}
            </div>
            <Field label="Role">
              <SelectInput required value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">Select role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.category})
                    {r.award_points ? ` • +${r.default_points} pts` : ''}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Hours worked" hint="Shown to the volunteer in their dashboard.">
              <input
                className="input"
                type="number"
                min={0}
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="e.g. 6"
              />
            </Field>
            <Field label="Notes (internal)">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Toggle checked={isPublic} onChange={setIsPublic} label="Show on public event page" />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              <Plus size={15} /> Add to team
            </Button>
          </form>
        </div>

        <div className="card lg:col-span-2">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="font-bold text-slate-900">Current team ({team.length})</h2>
          </div>
          {team.length === 0 ? (
            <EmptyState title="No team members yet" subtitle="Assign roles to start tracking event work and points." />
          ) : (
            <div className="divide-y divide-slate-100">
              {team.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={row.member?.full_name} src={row.member?.avatar_url} className="h-9 w-9 text-xs" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.member?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-slate-400">
                        {row.role?.name} • {row.role?.category} • {formatDate(row.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        id={`pub-${row.id}`}
                        type="checkbox"
                        checked={row.is_public}
                        onChange={(e) => togglePublic(row, e.target.checked)}
                        className="h-4 w-4 accent-primary-600"
                      />
                      <label htmlFor={`pub-${row.id}`} className="text-xs text-slate-500">
                        Public
                      </label>
                    </div>
                    <Badge tone={row.role?.category === 'coordinator' ? 'primary' : 'slate'}>{row.role?.name}</Badge>
                    {row.hours_worked > 0 && <Badge tone="green">{row.hours_worked} h</Badge>}
                    <button
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      onClick={() => removeMember(row)}
                      disabled={busy}
                      title="Remove"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
