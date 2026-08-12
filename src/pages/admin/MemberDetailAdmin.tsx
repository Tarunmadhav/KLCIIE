import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Award,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  Github,
  Heart,
  KeyRound,
  Linkedin,
  Mail,
  Medal,
  Send,
  ShieldCheck,
  Tags,
  Trophy,
  UserRound,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react'
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

function InfoRow({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2 text-sm text-slate-400">
        {icon && <span className="mt-0.5 text-slate-300">{icon}</span>}
        {label}
      </span>
      <span className="text-right text-sm font-medium text-slate-700">{value}</span>
    </div>
  )
}

function SectionCard({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          {icon && <span className="text-primary-600">{icon}</span>}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  )
}

const socialHref = (u: string, base: string) => {
  if (/^https?:\/\//i.test(u)) return u
  return base + u.replace(/^@/, '')
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
  if (!member) return <EmptyState icon={<UserRound size={40} />} title="Member not found" />

  const socials = [
    member.social_links?.telegram && { label: 'Telegram', icon: <Send size={15} />, href: socialHref(member.social_links.telegram, 'https://t.me/') },
    member.social_links?.github && { label: 'GitHub', icon: <Github size={15} />, href: socialHref(member.social_links.github, 'https://github.com/') },
    member.social_links?.linkedin && { label: 'LinkedIn', icon: <Linkedin size={15} />, href: socialHref(member.social_links.linkedin, 'https://linkedin.com/in/') },
    (member.social_links?.email ?? member.email) && { label: 'Email', icon: <Mail size={15} />, href: `mailto:${member.social_links?.email ?? member.email}` },
  ].filter(Boolean) as Array<{ label: string; icon: ReactNode; href: string }>

  const statCards = [
    { label: 'Total points', value: stats?.total_points ?? 0, icon: <Trophy size={18} /> },
    { label: 'Events worked', value: stats?.events_worked ?? 0, icon: <Briefcase size={18} /> },
    { label: 'Events attended', value: stats?.events_attended ?? 0, icon: <CalendarDays size={18} /> },
    { label: 'Volunteer activities', value: stats?.volunteer_activities ?? 0, icon: <Heart size={18} /> },
    { label: 'Achievements', value: stats?.achievements ?? 0, icon: <Medal size={18} /> },
    { label: 'Certificates', value: stats?.certificates ?? 0, icon: <Award size={18} /> },
  ]

  return (
    <div>
      <Link to="/admin/members" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline">
        ← All members
      </Link>

      <div className="relative mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={member.full_name} src={member.avatar_url} className="h-20 w-20 text-2xl ring-4 ring-white/20" />
            <div>
              <h1 className="text-2xl font-extrabold">{member.full_name ?? 'Unnamed member'}</h1>
              <p className="mt-0.5 text-sm text-slate-300">{member.ciie_id ?? 'No CIIE ID'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="primary">{ROLE_LABELS[member.role] ?? member.role}</Badge>
                {member.status === 'active' ? <Badge tone="green"><CheckCircle2 size={12} /> Active</Badge> : <Badge tone="red"><XCircle size={12} /> {member.status}</Badge>}
                {member.domain && <Badge tone="amber">{member.domain}</Badge>}
                {member.mfa_enabled && <Badge tone="green"><ShieldCheck size={12} /> MFA enabled</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button variant="secondary" onClick={toggleStatus} disabled={busy} className="!bg-white/10 !text-white hover:!bg-white/20">
              {member.status === 'active' ? 'Disable account' : 'Enable account'}
            </Button>
            <p className="text-xs text-slate-400">Member since {formatDate(member.created_at)}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {statCards.map((s) => (
          <div key={s.label} className="card flex flex-col items-center gap-1 p-4 text-center">
            <span className="text-primary-600">{s.icon}</span>
            <p className="text-xl font-extrabold text-slate-900">{s.value}</p>
            <p className="text-[11px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <SectionCard title="Personal info" icon={<UserRound size={15} />}>
            <div className="divide-y divide-slate-100">
              <InfoRow label="Full name" value={member.full_name ?? '—'} />
              <InfoRow label="Email" value={member.email ?? '—'} />
              <InfoRow label="Phone" value={member.phone ?? '—'} />
              <InfoRow label="CIIE ID" value={member.ciie_id ?? '—'} />
              <InfoRow label="Student ID" value={member.student_id ?? '—'} />
              <InfoRow label="Department" value={member.department ?? '—'} />
              <InfoRow label="Year of study" value={member.year_of_study ?? '—'} />
              <InfoRow label="Academic year" value={member.academic_year ?? '—'} />
              <InfoRow label="Team" value={member.team ?? '—'} />
              <InfoRow label="Interview batch" value={member.interview_batch ? `Batch ${member.interview_batch}` : '—'} />
            </div>
            {member.bio && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Bio</p>
                <p className="text-sm leading-relaxed text-slate-600">{member.bio}</p>
              </div>
            )}
            {member.skills?.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {member.skills.map((s) => (
                    <span key={s} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Social links" icon={<Send size={15} />}>
            {socials.length === 0 ? (
              <p className="text-sm text-slate-400">No social links added.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {socials.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700">
                    <span className="text-primary-600">{s.icon}</span> {s.label}
                  </a>
                ))}
              </div>
            )}
          </SectionCard>

          {member.custom_fields && Object.keys(member.custom_fields).length > 0 && (
            <SectionCard title="Custom fields" icon={<Tags size={15} />}>
              <div className="divide-y divide-slate-100">
                {Object.entries(member.custom_fields).map(([k, v]) => (
                  <InfoRow key={k} label={k} value={v || '—'} />
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Account" icon={<ShieldCheck size={15} />}>
            <div className="divide-y divide-slate-100">
              <InfoRow label="Status" value={<Badge tone={member.status === 'active' ? 'green' : 'red'}>{member.status}</Badge>} />
              <InfoRow label="Role" value={<Badge tone={isAdminRole(member.role) ? 'primary' : 'slate'}>{ROLE_LABELS[member.role] ?? member.role}</Badge>} />
              <InfoRow label="MFA enabled" value={member.mfa_enabled ? <Badge tone="green">Yes</Badge> : <Badge tone="slate">No</Badge>} />
              <InfoRow label="MFA setup required" value={member.mfa_setup_required ? <Badge tone="amber">Yes</Badge> : <Badge tone="slate">No</Badge>} />
              <InfoRow label="Last login" value={member.last_login_at ? formatDate(member.last_login_at) : 'Never'} />
              <InfoRow label="Created" value={formatDate(member.created_at)} />
              <InfoRow label="Last updated" value={formatDate(member.updated_at)} />
            </div>
          </SectionCard>

          <SectionCard title="Privacy settings" icon={<KeyRound size={15} />}>
            <div className="space-y-2.5">
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
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard
            title="Achievements"
            icon={<Medal size={15} />}
            action={<Badge tone="primary">{stats?.achievements ?? 0}</Badge>}
          >
            <form onSubmit={addAchievement} className="mb-4 space-y-3 rounded-xl bg-slate-50 p-4">
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
                <Medal size={15} /> Add achievement
              </Button>
            </form>
            <div className="space-y-2">
              {achievements.length === 0 ? (
                <p className="text-sm text-slate-400">No achievements yet.</p>
              ) : (
                achievements.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                      <p className="text-xs text-slate-400">{a.category} • {formatDate(a.achieved_on)}</p>
                      {a.description && <p className="mt-0.5 text-xs text-slate-500">{a.description}</p>}
                    </div>
                    <button className="shrink-0 text-xs font-medium text-red-500 hover:underline" onClick={() => removeAchievement(a)}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard title="Events worked" icon={<Briefcase size={15} />} action={<Badge tone="primary">{worked.length}</Badge>}>
            {worked.length === 0 ? (
              <p className="text-sm text-slate-400">No event team assignments.</p>
            ) : (
              <div className="space-y-2">
                {worked.map((w) => (
                  <div key={`${w.event_id}-${w.role_name}`} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                    <Link to={`/admin/events/${w.event_id}`} className="truncate text-sm font-medium text-primary-600 hover:underline">
                      {w.title}
                    </Link>
                    <Badge tone="slate" className="shrink-0">{w.role_name}</Badge>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard title="Points history" icon={<Wallet size={15} />} action={<Badge tone="primary">{txs.length}</Badge>}>
            {txs.length === 0 ? (
              <p className="text-sm text-slate-400">No points transactions.</p>
            ) : (
              <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto pr-1">
                {txs.map((tx) => {
                  const awarder = (tx.awarded_by as { full_name?: string | null } | null)?.full_name
                  return (
                    <div key={tx.id} className="flex items-center justify-between gap-2 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-700">{tx.description ?? tx.activity_type}</p>
                        <p className="text-[10px] text-slate-400">
                          {tx.activity_type} • {formatDate(tx.created_at)}
                          {awarder ? ` • by ${awarder}` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 text-sm font-bold ${tx.points > 0 ? 'text-green-600' : 'text-red-600'}`}>{moneyPoints(tx.points)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Certificates & attendance" icon={<Award size={15} />}>
            <div className="divide-y divide-slate-100">
              <InfoRow label="Certificates earned" value={stats?.certificates ?? 0} />
              <InfoRow label="Events attended" value={stats?.events_attended ?? 0} />
              <InfoRow label="Volunteer activities" value={stats?.volunteer_activities ?? 0} />
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              <Users size={14} className="shrink-0 text-primary-600" />
              Full activity history for this member is managed under Events & Attendance.
            </div>
          </SectionCard>

          <SectionCard title="Registered" icon={<Clock size={15} />}>
            <div className="space-y-2 text-sm">
              <InfoRow label="Member since" value={formatDate(member.created_at)} />
              <InfoRow label="Account created" value={formatDate(member.created_at)} />
              <InfoRow label="Profile updated" value={formatDate(member.updated_at)} />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
