import type { CustomFieldDef, RecruitApplicationRow, RecruitStage } from '@/lib/types'
import { Avatar, Badge } from '@/components/ui'

export const STAGE_META: Record<RecruitStage, { label: string; tone: 'green' | 'amber' | 'red' | 'slate' | 'primary' }> = {
  gd: { label: 'GD pending', tone: 'amber' },
  interview: { label: 'Interview pending', tone: 'primary' },
  final: { label: 'Final selection', tone: 'slate' },
  selected: { label: 'Selected', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export function StageBadge({ stage }: { stage: RecruitStage }) {
  const meta = STAGE_META[stage]
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

export function ApplicantInfo({ row }: { row: RecruitApplicationRow }) {
  const detail = [row.student_id, row.department, row.year_of_study].filter(Boolean).join(' • ')
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={row.full_name} className="h-10 w-10 text-xs" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{row.full_name ?? '—'}</p>
        <p className="truncate text-xs text-slate-500">{row.email ?? '—'}</p>
        <p className="truncate text-[11px] text-slate-400">
          {detail || '—'}
          {row.interview_batch ? ` • Batch ${row.interview_batch}` : ''}
        </p>
      </div>
    </div>
  )
}

export function ResponsesView({
  title,
  evaluator,
  ciieId,
  submittedAt,
  fields,
  responses,
  remarks,
}: {
  title: string
  evaluator?: string | null
  ciieId?: string | null
  submittedAt?: string | null
  fields?: CustomFieldDef[] | null
  responses?: Record<string, unknown> | null
  remarks?: string | null
}) {
  const fieldList = fields ?? []
  const pairs = fieldList
    .map((f) => ({ f, value: (responses ?? {})[f.key] }))
    .filter(({ value }) => value != null && String(value).trim() !== '')

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      {evaluator && (
        <p className="text-xs text-slate-400">
          Evaluated by {evaluator}
          {ciieId ? ` • ${ciieId}` : ''}
          {submittedAt ? ` • ${new Date(submittedAt).toLocaleString('en-IN')}` : ''}
        </p>
      )}
      {pairs.length === 0 && !remarks ? (
        <p className="mt-2 text-xs text-slate-400">No responses recorded.</p>
      ) : (
        <>
          {pairs.length > 0 && (
            <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {pairs.map(({ f, value }) => (
                <div key={f.key}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{f.label}</dt>
                  <dd className="break-words text-sm text-slate-700">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
          {remarks && (
            <p className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-500">Remarks: </span>
              {remarks}
            </p>
          )}
        </>
      )}
    </div>
  )
}
