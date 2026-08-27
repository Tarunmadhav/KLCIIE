import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Award, Plus, Trash2 } from 'lucide-react'
import { Avatar, Badge, Button, EmptyState, Field, PageHeader, PageLoader, SelectInput, TextInput, Toggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { fetchAllProfiles } from '@/lib/queries'
import type { Event, Profile } from '@/lib/types'
import { errorMessage, formatDateTime, moneyPoints } from '@/lib/utils'

interface TxRow {
  id: string
  member_id: string
  event_id: string | null
  activity_type: string
  points: number
  description: string | null
  awarded_by: Pick<Profile, 'id' | 'full_name'> | null
  is_automatic: boolean
  reference_type: string | null
  reference_id: string | null
  created_at: string
  member?: Pick<Profile, 'id' | 'full_name' | 'ciie_id'> | null
  event?: Pick<Event, 'id' | 'title'> | null
}

export default function Points() {
  const [members, setMembers] = useState<Profile[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [search, setSearch] = useState('')
  const [memberId, setMemberId] = useState('')
  const [points, setPoints] = useState('10')
  const [activityType, setActivityType] = useState('')
  const [description, setDescription] = useState('')
  const [eventId, setEventId] = useState('')
  const [automatic, setAutomatic] = useState(false)
  const [txs, setTxs] = useState<TxRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [memberData, eventData, txData] = await Promise.all([
      fetchAllProfiles<Profile>('id, full_name, ciie_id, department, status', (q) => q.eq('status', 'active').order('full_name')),
      supabase.from('events').select('id, title').order('start_date', { ascending: false }).limit(50),
      supabase
        .from('member_points_transactions')
        .select('*, member:profiles!member_points_transactions_member_id_fkey(id, full_name, ciie_id), event:events(id, title), awarded_by:profiles!member_points_transactions_awarded_by_fkey(id, full_name)')
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    setMembers(memberData)
    setEvents((eventData.data ?? []) as Event[])
    setTxs((txData.data ?? []) as TxRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => (m.full_name ?? '').toLowerCase().includes(q) || (m.ciie_id ?? '').toLowerCase().includes(q))
  }, [members, search])

  const award = async (e: FormEvent) => {
    e.preventDefault()
    const p = Number(points)
    if (!memberId || !p || !activityType.trim()) {
      setError('Member, points and activity type are required.')
      return
    }
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('award_points', {
      p_member_id: memberId,
      p_points: p,
      p_activity_type: activityType.trim().toLowerCase().replace(/\s+/g, '_'),
      p_description: description || null,
      p_event_id: eventId || null,
      p_reference_type: automatic ? 'manual' : null,
      p_reference_id: null,
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    if (data) {
      setMemberId('')
      setSearch('')
      setPoints('10')
      setActivityType('')
      setDescription('')
      setEventId('')
      setAutomatic(false)
      load()
    }
  }

  const removeTx = async (tx: TxRow) => {
    if (tx.is_automatic) {
      alert('Automatic transactions are protected. Use the corresponding event/attendance action to correct them.')
      return
    }
    if (!window.confirm('Delete this points transaction? This reverses the award for the member.')) return
    const { error } = await supabase.from('member_points_transactions').delete().eq('id', tx.id)
    if (error) {
      alert(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Points Transaction Deleted', p_entity_type: 'points', p_entity_id: tx.id })
    load()
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader title="Points & Awards" subtitle="Manually award or deduct CIIE points. Ledger is immutable — use delete to reverse a manual award." />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card h-fit p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Award size={16} className="text-primary-600" /> Award points
          </h2>
          <form onSubmit={award} className="mt-4 space-y-4">
            <Field label="Search member">
              <input className="input" placeholder="Name or CIIE ID…" value={search} onChange={(e) => { setSearch(e.target.value); setMemberId('') }} />
            </Field>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {filtered.length === 0 && <p className="p-2 text-sm text-slate-400">No members match.</p>}
              {filtered.slice(0, 20).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setMemberId(m.id); setSearch(m.full_name ?? '') }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-primary-50 ${
                    memberId === m.id ? 'bg-primary-50 text-primary-700' : 'text-slate-700'
                  }`}
                >
                  <Avatar name={m.full_name} className="h-6 w-6 text-[10px]" />
                  <span className="min-w-0 flex-1 truncate">{m.full_name}</span>
                  <span className="text-[10px] text-slate-400">{m.ciie_id}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Points" hint="Negative deducts.">
                <TextInput type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
              </Field>
              <Field label="Activity type">
                <TextInput required value={activityType} onChange={(e) => setActivityType(e.target.value)} placeholder="e.g. special_recognition" />
              </Field>
            </div>
            <Field label="Description">
              <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Reason shown on the member's points history" />
            </Field>
            <Field label="Linked event (optional)">
              <SelectInput value={eventId} onChange={(e) => setEventId(e.target.value)}>
                <option value="">None</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Toggle checked={automatic} onChange={setAutomatic} label="Treat as system-awarded (protect from manual delete)" />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              <Plus size={15} /> Award
            </Button>
          </form>
        </div>

        <div className="lg:col-span-3">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3">
              <h2 className="font-bold text-slate-900">Recent transactions</h2>
            </div>
            {txs.length === 0 ? (
              <EmptyState title="No transactions yet" />
            ) : (
              <div className="divide-y divide-slate-100">
                {txs.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-slate-900">{tx.member?.full_name ?? 'Member'}</span>
                        {tx.is_automatic ? <Badge tone="primary">auto</Badge> : <Badge tone="amber">manual</Badge>}
                        <span className="text-xs text-slate-400">{tx.activity_type}</span>
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {tx.description ?? '—'}
                        {tx.event ? ` • ${tx.event.title}` : ''} • {formatDateTime(tx.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-extrabold ${tx.points > 0 ? 'text-green-600' : 'text-red-600'}`}>{moneyPoints(tx.points)}</span>
                      {!tx.is_automatic && (
                        <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeTx(tx)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
