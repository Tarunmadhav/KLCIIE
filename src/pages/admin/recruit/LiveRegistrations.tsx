import { useMemo } from 'react'
import { RadioTower, UserPlus } from 'lucide-react'
import { Avatar, Badge, EmptyState, PageHeader } from '@/components/ui'
import { useRecruitLive } from '@/hooks/useRecruitLive'
import type { RecruitApplicationRow } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { STAGE_META } from '@/pages/member/recruit/RecruitBits'

const STAGE_ORDER: RecruitApplicationRow['stage'][] = ['gd', 'interview', 'final', 'selected', 'rejected']

export default function LiveRegistrations() {
  const { rows, error } = useRecruitLive()
  const list = rows ?? []

  const counts = useMemo(() => {
    const c: Record<string, number> = { gd: 0, interview: 0, final: 0, selected: 0, rejected: 0 }
    for (const r of list) c[r.stage] = (c[r.stage] ?? 0) + 1
    return c
  }, [list])

  const sorted = useMemo(
    () => [...list].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.created_at.localeCompare(b.created_at)),
    [list],
  )

  return (
    <div>
      <PageHeader
        title="Live Registrations"
        subtitle="Every recruitment application in real time — GD, Interview, Final Selection and decisions."
        actions={
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
            <RadioTower size={14} /> Live
          </span>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STAGE_ORDER.map((stage) => (
          <div key={stage} className="card flex items-center justify-between px-4 py-3">
            <span className="text-xs font-medium text-slate-500">{STAGE_META[stage].label}</span>
            <Badge tone={STAGE_META[stage].tone}>{counts[stage] ?? 0}</Badge>
          </div>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {sorted.length === 0 ? (
        <EmptyState
          icon={<UserPlus size={36} />}
          title="No registrations yet"
          subtitle="New Join CIIE signups appear here instantly."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3 font-semibold">Applicant</th>
                <th className="px-5 py-3 font-semibold">Contact</th>
                <th className="px-5 py-3 font-semibold">Stage</th>
                <th className="px-5 py-3 font-semibold">GD</th>
                <th className="px-5 py-3 font-semibold">Interview</th>
                <th className="px-5 py-3 font-semibold">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((r) => (
                <tr key={r.application_id} className="align-top hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.full_name} className="h-8 w-8 text-[10px]" />
                      <div>
                        <p className="font-semibold text-slate-900">{r.full_name ?? '—'}</p>
                        <p className="text-[11px] text-slate-400">
                          {r.student_id ?? '—'} • {r.interview_batch ? `Batch ${r.interview_batch}` : '—'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-slate-700">{r.email ?? '—'}</p>
                    <p className="text-[11px] text-slate-400">
                      {[r.phone, r.department, r.year_of_study].filter(Boolean).join(' • ') || '—'}
                    </p>
                    <p className="text-[11px] text-slate-400">Applied {formatDate(r.created_at)}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={STAGE_META[r.stage].tone}>{STAGE_META[r.stage].label}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    {r.gd_submitted_at ? (
                      <div>
                        <p className="text-xs text-slate-700">{r.gd_evaluator ?? '—'}</p>
                        <p className="text-[11px] text-slate-400">{formatDate(r.gd_submitted_at)}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {r.interview_submitted_at ? (
                      <div>
                        <p className="text-xs text-slate-700">{r.interview_evaluator ?? '—'}</p>
                        <p className="text-[11px] text-slate-400">{formatDate(r.interview_submitted_at)}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {r.final_decision ? (
                      <div>
                        <Badge tone={r.final_decision === 'selected' ? 'green' : 'red'}>
                          {r.final_decision === 'selected' ? 'Selected' : 'Rejected'}
                        </Badge>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {r.decided_by ?? '—'} • {r.decided_at ? formatDate(r.decided_at) : '—'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
