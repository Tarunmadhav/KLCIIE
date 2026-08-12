import { useMemo, useState } from 'react'
import { ClipboardCheck, Send } from 'lucide-react'
import { Button, EmptyState, Modal, PageHeader, Spinner, TextArea } from '@/components/ui'
import { CustomFieldInputs, missingFields } from '@/components/RegistrationFormFields'
import { useRecruitLive } from '@/hooks/useRecruitLive'
import { supabase } from '@/lib/supabase'
import type { RecruitApplicationRow, RecruitFormTemplate } from '@/lib/types'
import { errorMessage } from '@/lib/utils'
import { ApplicantInfo, ResponsesView, StageBadge } from './RecruitBits'

export default function RecruitInterview() {
  const { rows, error: liveError } = useRecruitLive()

  const [active, setActive] = useState<RecruitApplicationRow | null>(null)
  const [template, setTemplate] = useState<RecruitFormTemplate | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const interviewRows = useMemo(() => (rows ?? []).filter((r) => r.stage === 'interview'), [rows])

  const open = async (row: RecruitApplicationRow) => {
    setActive(row)
    setValues({})
    setRemarks('')
    setError('')
    const { data } = await supabase
      .from('recruit_form_templates')
      .select('*')
      .eq('kind', 'interview')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setTemplate((data as RecruitFormTemplate | null) ?? null)
  }

  const submit = async () => {
    if (!active) return
    const fields = template?.fields ?? []
    if (!template) {
      setError('The Interview form has not been configured yet. Ask an admin to create it.')
      return
    }
    const missing = missingFields(fields, values)
    if (missing) {
      setError(missing)
      return
    }
    setBusy(true)
    setError('')
    const { error: err } = await supabase.rpc('submit_recruit_evaluation', {
      p_application_id: active.application_id,
      p_kind: 'interview',
      p_responses: values,
      p_remarks: remarks.trim() || null,
    })
    setBusy(false)
    if (err) {
      setError(errorMessage(err))
      return
    }
    setActive(null)
  }

  return (
    <div>
      <PageHeader
        title="Interview Round"
        subtitle="Only applicants whose GD form has been submitted appear here. Review the GD remarks, then fill the Interview form to forward them to Final Selection."
      />

      {liveError && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{liveError}</p>}

      {interviewRows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={36} />}
          title="No applicants in the Interview round"
          subtitle="Applicants are forwarded here automatically once their GD form is submitted."
        />
      ) : (
        <div className="card divide-y divide-slate-100">
          {interviewRows.map((row) => (
            <div key={row.application_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <ApplicantInfo row={row} />
              <div className="flex items-center gap-3">
                <StageBadge stage={row.stage} />
                <Button className="!px-3 !py-1.5 text-xs" onClick={() => void open(row)}>
                  <ClipboardCheck size={14} /> Open interview form
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!active} onClose={() => setActive(null)} title={`Interview form — ${active?.full_name ?? ''}`} wide>
        {active && (
          <div className="space-y-4">
            <ApplicantInfo row={active} />

            <ResponsesView
              title="GD round"
              evaluator={active.gd_evaluator}
              fields={active.gd_form_fields}
              responses={active.gd_responses}
              remarks={active.gd_remarks}
            />

            {template ? (
              <>
                <div>
                  <p className="text-sm font-bold text-slate-900">{template.title}</p>
                  {template.description && <p className="text-xs text-slate-500">{template.description}</p>}
                </div>
                <CustomFieldInputs fields={template.fields} values={values} onChange={setValues} />
                <div>
                  <p className="label">Remarks</p>
                  <TextArea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Overall remarks about this applicant in the Interview round…" />
                </div>
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <Button className="w-full" disabled={busy} onClick={() => void submit()}>
                  {busy ? <Spinner className="border-white/40 border-t-white" /> : (
                    <>
                      <Send size={16} /> Submit Interview form &amp; forward to Final Selection
                    </>
                  )}
                </Button>
              </>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                The Interview form has not been configured yet. Ask an admin to create it under Admin → Recruit Forms.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
