import { useEffect, useMemo, useState } from 'react'
import { UserCheck, UserPlus } from 'lucide-react'
import { Avatar, Badge, Button, EmptyState, PageHeader, PageLoader, SelectInput } from '@/components/ui'
import { useSettings } from '@/hooks/useSettings'
import { supabase } from '@/lib/supabase'
import { ADMIN_ROLES, ROLE_LABELS, type Profile } from '@/lib/types'
import { errorMessage, formatDate } from '@/lib/utils'

interface RecruitRow extends Profile {
  interview_date: string | null
}

export default function Recruits() {
  const settings = useSettings()
  const [rows, setRows] = useState<RecruitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [roleByMember, setRoleByMember] = useState<Record<string, string>>({})

  const load = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setRows(
      ((data ?? []) as Profile[]).map((r) => ({
        ...r,
        interview_date: (r.interview_batch === 2 ? settings.interview_day_2 : settings.interview_day_1) ?? null,
      })),
    )
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.interview_day_1, settings.interview_day_2])

  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows])

  const act = async (r: RecruitRow, kind: 'recruit' | 'member' | 'reject') => {
    if (kind === 'reject' && !window.confirm(`Reject ${r.full_name}? Their account will be disabled so they can re-apply next year.`)) {
      return
    }
    setBusyId(r.id)
    setError('')
    const payload =
      kind === 'recruit'
        ? { status: 'active' as const, role: (roleByMember[r.id] ?? 'attendance_coordinator') as Profile['role'] }
        : kind === 'member'
          ? { status: 'active' as const, role: 'member' as const }
          : { status: 'disabled' as const }
    const { error: upErr } = await supabase.from('profiles').update(payload).eq('id', r.id)
    setBusyId(null)
    if (upErr) {
      setError(errorMessage(upErr))
      return
    }
    await supabase.rpc('log_admin_event', {
      p_action: kind === 'recruit' ? 'Recruit Approved' : kind === 'member' ? 'Recruit Made Member' : 'Recruit Rejected',
      p_entity_type: 'member',
      p_entity_id: r.id,
      p_details: payload,
    })
    load()
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Recruits"
        subtitle={`${pending.length} applicant(s) awaiting GD & Interview. Approve them as CIIE members, or reject them so they can re-apply next year.`}
      />

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {pending.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={36} />}
          title="No applicants yet"
          subtitle="New students appear here as soon as they complete the Join CIIE form."
        />
      ) : (
        <div className="card divide-y divide-slate-100">
          {pending.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="flex items-center gap-3">
                <Avatar name={r.full_name} src={r.avatar_url} className="h-9 w-9 text-xs" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{r.full_name}</p>
                  <p className="text-xs text-slate-400">
                    {r.email} • {r.department ?? '—'} • {r.year_of_study ?? '—'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Applied {formatDate(r.created_at)} • Batch {r.interview_batch ?? '—'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {r.interview_date ? (
                  <Badge tone="primary">GD &amp; Interview {formatDate(r.interview_date)}</Badge>
                ) : (
                  <Badge tone="slate">Date to be announced</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SelectInput
                  className="!w-48 !py-1.5 text-xs"
                  value={roleByMember[r.id] ?? 'attendance_coordinator'}
                  onChange={(e) => setRoleByMember({ ...roleByMember, [r.id]: e.target.value })}
                >
                  {ADMIN_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </SelectInput>
                <Button
                  variant="secondary"
                  className="!px-3 !py-1.5 text-xs"
                  disabled={busyId === r.id}
                  onClick={() => act(r, 'recruit')}
                >
                  <UserCheck size={14} /> Recruit to CIIE
                </Button>
                <Button className="!px-3 !py-1.5 text-xs" disabled={busyId === r.id} onClick={() => act(r, 'member')}>
                  Now a member
                </Button>
                <Button
                  variant="danger"
                  className="!px-3 !py-1.5 text-xs"
                  disabled={busyId === r.id}
                  onClick={() => act(r, 'reject')}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
