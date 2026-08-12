import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Medal, UserX } from 'lucide-react'
import { Avatar, Badge, Button, EmptyState, Field, PageLoader, TextInput, Toggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS, isAdminRole, type MemberAchievement, type MemberStats, type PointsTransaction, type Profile } from '@/lib/types'
import { errorMessage, formatDate, moneyPoints } from '@/lib/utils'

interface Privacy {
  show_on_leaderboard: boolean
  show_public_profile: boolean
  show_points: boolean
  show_events: boolean
  show_contact: boolean
  show_avatar: boolean
}

export default function MemberDetailAdmin() {
  const { id } = useParams<{ id: string }>()
  const [member, setMember] = useState<Profile | null>(null)
  const [stats, setStats] = useState<MemberStats | null>(null)
  const [privacy, setPrivacy] = useState<Privacy | null>(null)
  const [txs, setTxs] = useState<PointsTransaction[]>([])
  const [achievements, setAchievements] = useState<MemberAchievement[]>([])
  const [worked, setWorked] = useState<Array<{ event_id: string; title: string; role_name: string; role_category: string; start_date: string }>>([])
  const [achTitle, setAchTitle] = useState('')
  const [achDesc, setAchDesc] = useState('')
  const [achCat, setAchCat] = useState('Achievement')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!id) return
    const [profileResult, statsResult, privResult, txResult, achResult, workResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('v_member_stats').select('*').eq('member_id', id).maybeSingle(),
      supabase.from('member_privacy_settings').select('*').eq('member_id', id).maybeSingle(),
      supabase
        .from('member_points_transactions')
        .select('*, event:events(id, title), awarded_by:profiles!member_points_transactions_awarded_by_fkey(full_name)')
        .eq('member_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('member_achievements').select('*').eq('member_id', id).order('achieved_on', { ascending: false }),
      supabase.rpc('get_member_events_worked', { p_member_id: id }),
    ])
    setMember((profileResult.data ?? null) as Profile | null)
    setStats((statsResult.data ?? null) as MemberStats | null)
    setPrivacy((privResult.data ?? null) as Privacy | null)
    setTxs((txResult.data ?? []) as PointsTransaction[])
    setAchievements((achResult.data ?? []) as MemberAchievement[])
    setWorked((workResult.data ?? []) as typeof worked)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const toggleStatus = async () => {
    if (!member) return
    const next = member.status === 'active' ? 'disabled' : 'active'
    if (!window.confirm(`${next === 'disabled' ? 'Disable' : 'Enable'} ${member.full_name}?`)) return
    const { error } = await supabase.from('profiles').update({ status: next }).eq('id', member.id)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: `Member ${next === 'disabled' ? 'Disabled' : 'Enabled'}`, p_entity_type: 'member', p_entity_id: member.id })
    load()
  }

  const setPrivacyField = async (key: keyof Privacy, value: boolean) => {
    if (!member) return
    await supabase.from('member_privacy_settings').upsert({ member_id: member.id, [key]: value }, { onConflict: 'member_id' })
    load()
  }

  const addAchievement = async (e: FormEvent) => {
    e.preventDefault()
    if (!member || !achTitle.trim()) return
    setBusy(true)
    const { error } = await supabase.from('member_achievements').insert({
      member_id: member.id,
      title: achTitle.trim(),
      description: achDesc || null,
      category: achCat || 'Achievement',
      achieved_on: new Date().toISOString().slice(0, 10),
    })
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    setAchTitle('')
    setAchDesc('')
    load()
  }

  const removeAchievement = async (a: MemberAchievement) => {
    await supabase.from('member_achievements').delete().eq('id', a.id)
    load()
  }

  if (loading) return <PageLoader />
  if (!member) return <EmptyState icon={<UserX size={40} />} title="Member not found" />

  return (
    <div>
      <Link to="/admin/members" className="text-sm font-medium text-primary-600 hover:underline">
        ← All members
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={member.full_name} src={member.avatar_url} className="h-16 w-16 text-xl" />
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{member.full_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span>{member.ciie_id ?? 'No CIIE ID'}</span>
              {member.domain && <Badge tone="green">{member.domain}</Badge>}
              <Badge tone={isAdminRole(member.role) ? 'primary' : 'slate'}>{ROLE_LABELS[member.role] ?? member.role}</Badge>
              <Badge tone={member.status === 'active' ? 'green' : 'red'}>{member.status}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-400">{member.email ?? '—'} • Joined {formatDate(member.created_at)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {member.mfa_enabled && <Badge tone="green">MFA enabled</Badge>}
          <Button variant="secondary" onClick={toggleStatus} disabled={busy}>
            {member.status === 'active' ? 'Disable account' : 'Enable account'}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {[
          { label: 'Total points', value: stats?.total_points ?? 0 },
          { label: 'Events worked', value: stats?.events_worked ?? 0 },
          { label: 'Events attended', value: stats?.events_attended ?? 0 },
          { label: 'Volunteer activities', value: stats?.volunteer_activities ?? 0 },
          { label: 'Achievements', value: stats?.achievements ?? 0 },
          { label: 'Certificates', value: stats?.certificates ?? 0 },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-xl font-extrabold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card h-fit p-5">
          <h2 className="text-base font-bold text-slate-900">Profile</h2>
          <div className="mt-3 space-y-2 text-sm">
            {[
              ['Department', member.department ?? '—'],
              ['Year of study', member.year_of_study ?? '—'],
              ['Academic year', member.academic_year ?? '—'],
              ['Team', member.team ?? '—'],
              ['Phone', member.phone ?? '—'],
              ['Skills', member.skills?.length ? member.skills.join(', ') : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <span className="text-slate-400">{k}</span>
                <span className="text-right font-medium text-slate-700">{v}</span>
              </div>
            ))}
          </div>
          <h2 className="mt-5 text-base font-bold text-slate-900">Privacy</h2>
          <div className="mt-2 space-y-2">
            {(
              [
                ['show_public_profile', 'Public profile'],
                ['show_on_leaderboard', 'On leaderboard'],
                ['show_points', 'Show points'],
                ['show_events', 'Show events'],
                ['show_contact', 'Show contact'],
                ['show_avatar', 'Show avatar'],
              ] as Array<[keyof Privacy, string]>
            ).map(([k, label]) => (
              <Toggle key={k} checked={privacy?.[k] ?? true} onChange={(v) => setPrivacyField(k, v)} label={label} />
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-base font-bold text-slate-900">Add achievement</h2>
          <form onSubmit={addAchievement} className="mt-3 space-y-3">
            <Field label="Title">
              <TextInput required value={achTitle} onChange={(e) => setAchTitle(e.target.value)} placeholder="e.g. Winner — Hackathon 2026" />
            </Field>
            <Field label="Category">
              <TextInput value={achCat} onChange={(e) => setAchCat(e.target.value)} placeholder="Achievement / Winner / Award" />
            </Field>
            <Field label="Description">
              <TextInput value={achDesc} onChange={(e) => setAchDesc(e.target.value)} />
            </Field>
            <Button type="submit" disabled={busy}>
              <Medal size={15} /> Add
            </Button>
          </form>

          <div className="mt-5 space-y-2">
            {achievements.length === 0 ? (
              <p className="text-sm text-slate-400">No achievements yet.</p>
            ) : (
              achievements.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-400">
                      {a.category} • {formatDate(a.achieved_on)}
                    </p>
                  </div>
                  <button className="text-xs font-medium text-red-500 hover:underline" onClick={() => removeAchievement(a)}>
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="text-base font-bold text-slate-900">Events worked ({worked.length})</h2>
            <div className="mt-2 space-y-2">
              {worked.length === 0 ? (
                <p className="text-sm text-slate-400">No event team assignments.</p>
              ) : (
                worked.map((w) => (
                  <div key={`${w.event_id}-${w.role_name}`} className="flex items-center justify-between gap-2 text-sm">
                    <Link to={`/admin/events/${w.event_id}`} className="font-medium text-primary-600 hover:underline">
                      {w.title}
                    </Link>
                    <Badge tone="slate">{w.role_name}</Badge>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-base font-bold text-slate-900">Points history ({txs.length})</h2>
            <div className="mt-2 divide-y divide-slate-100">
              {txs.length === 0 ? (
                <p className="text-sm text-slate-400">No points transactions.</p>
              ) : (
                txs.slice(0, 15).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className="text-sm text-slate-700">{tx.description ?? tx.activity_type}</p>
                      <p className="text-[10px] text-slate-400">
                        {tx.activity_type} • {formatDate(tx.created_at)}
                      </p>
                    </div>
                    <span className={`text-sm font-bold ${tx.points > 0 ? 'text-green-600' : 'text-red-600'}`}>{moneyPoints(tx.points)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
