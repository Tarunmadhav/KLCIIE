import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Mail, ShieldAlert, UserCheck, XCircle } from 'lucide-react'
import { Badge, Button, EmptyState, Modal, PageHeader, Spinner, TextArea } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useRecruitLive } from '@/hooks/useRecruitLive'
import { supabase } from '@/lib/supabase'
import type { RecruitApplicationRow, RecruitRejectRequest } from '@/lib/types'
import { errorMessage } from '@/lib/utils'
import { ApplicantInfo, ResponsesView, StageBadge } from './RecruitBits'

export default function RecruitFinalSelection() {
  const { user } = useAuth()
  const { rows, error: liveError, refresh } = useRecruitLive()

  const [approving, setApproving] = useState<RecruitApplicationRow | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [request, setRequest] = useState<RecruitRejectRequest | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [reason, setReason] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)
  const [rejectError, setRejectError] = useState('')

  const rows2 = rows ?? []
  const pending = useMemo(() => rows2.filter((r) => r.stage === 'final'), [rows2])
  const decided = useMemo(() => rows2.filter((r) => r.stage === 'selected' || r.stage === 'rejected'), [rows2])

  const loadRequest = async () => {
    if (!user) return
    const { data } = await supabase
      .from('recruit_reject_requests')
      .select('*')
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setRequest((data as RecruitRejectRequest | null) ?? null)
  }

  useEffect(() => {
    void loadRequest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Live update: when an admin approves/denies the request, reflect it instantly.
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`reject-request-live-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recruit_reject_requests', filter: `requested_by=eq.${user.id}` },
        () => void loadRequest(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const openApprove = (row: RecruitApplicationRow) => {
    setApproving(row)
    setMessage('')
    setError('')
    setNotice('')
  }

  const approve = async () => {
    if (!approving) return
    if (!message.trim()) {
      setError('A congratulation message is required — it is shown in the email sent to the applicant.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    const { data, error: err } = await supabase.rpc('select_recruit', {
      p_application_id: approving.application_id,
      p_message: message.trim(),
    })
    if (err) {
      setBusy(false)
      setError(errorMessage(err))
      return
    }
    const mail = (data as { to_email?: string; subject?: string; text?: string; html?: string } | null) ?? {}
    const { error: mailErr } = await supabase.functions.invoke('send-recruit-email', { body: mail })
    setBusy(false)
    if (mailErr) {
      setNotice(`Approved, but the congratulations email could not be sent: ${errorMessage(mailErr)}`)
      setApproving(null)
      void refresh()
      return
    }
    setNotice('Approved. A congratulations email has been sent to the applicant (check Admin > Live Registrations for the mail log).')
    setApproving(null)
    void refresh()
  }

  const requestRejectAll = async () => {
    setRejectBusy(true)
    setRejectError('')
    const { error: err } = await supabase.rpc('request_reject_all', { p_reason: reason.trim() || null })
    setRejectBusy(false)
    if (err) {
      setRejectError(errorMessage(err))
      return
    }
    setReason('')
    setRequesting(false)
    await loadRequest()
  }

  const executeRejectAll = async () => {
    if (!request) return
    if (!window.confirm('Reject ALL remaining applicants in Final Selection? Approved applicants are kept. This cannot be undone.')) return
    setRejectBusy(true)
    setRejectError('')
    const { error: err } = await supabase.rpc('execute_reject_all', { p_request_id: request.id })
    setRejectBusy(false)
    if (err) {
      setRejectError(errorMessage(err))
      return
    }
    await loadRequest()
    void refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Final Selection"
        subtitle="Applicants who cleared both rounds. Approve the ones you want — a mandatory message is sent to them by email. Reject all the rest with admin permission."
      />

      {liveError && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{liveError}</p>}
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}

      <section className="card space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <ShieldAlert size={16} className="text-primary-600" /> Reject all except approved
            </h2>
            <p className="text-xs text-slate-500">
              {pending.length} applicant(s) still awaiting a decision. Requires admin permission.
            </p>
          </div>
          {(!request || request.status === 'used' || request.status === 'denied') && (
            <Button
              variant="secondary"
              className="!px-3 !py-1.5 text-xs"
              disabled={pending.length === 0}
              onClick={() => setRequesting(true)}
            >
              {request?.status === 'denied' ? 'Request again' : 'Request permission'}
            </Button>
          )}
        </div>

        {request && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            {request.status === 'pending' && (
              <p className="text-sm text-amber-700">
                Your reject-all request is <b>pending</b> — waiting for admin approval.
              </p>
            )}
            {request.status === 'approved' && (
              <div className="space-y-3">
                <p className="text-sm text-green-700">Admin has <b>approved</b> your reject-all request.</p>
                <Button variant="danger" className="!px-3 !py-1.5 text-xs" disabled={rejectBusy} onClick={() => void executeRejectAll()}>
                  {rejectBusy ? <Spinner /> : <XCircle size={14} />} Reject all {pending.length} remaining
                </Button>
              </div>
            )}
            {request.status === 'denied' && (
              <p className="text-sm text-red-700">
                Your reject-all request was <b>denied</b> by an admin — you can send a new request above.
              </p>
            )}
            {request.status === 'used' && (
              <p className="text-sm text-slate-600">
                Reject-all was <b>completed</b>. New applicants reaching Final Selection need a fresh permission — use the
                button above.
              </p>
            )}
            {rejectError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{rejectError}</p>}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-900">
          Awaiting decision <Badge tone="primary">{pending.length}</Badge>
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            icon={<UserCheck size={36} />}
            title="Nothing pending"
            subtitle="Every applicant who cleared the interview round has a decision."
          />
        ) : (
          <div className="card divide-y divide-slate-100">
            {pending.map((row) => (
              <div key={row.application_id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ApplicantInfo row={row} />
                  <div className="flex items-center gap-3">
                    <StageBadge stage={row.stage} />
                    <Button className="!px-3 !py-1.5 text-xs" onClick={() => openApprove(row)}>
                      <CheckCircle2 size={14} /> Approve
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <ResponsesView
                    title="GD round"
                    evaluator={row.gd_evaluator}
                    fields={row.gd_form_fields}
                    responses={row.gd_responses}
                    remarks={row.gd_remarks}
                  />
                  {(row.interview_evaluations ?? []).length === 0 ? (
                    <ResponsesView title="Interview round" fields={row.interview_form_fields} />
                  ) : (
                    (row.interview_evaluations ?? []).map((ev, i) => (
                      <ResponsesView
                        key={ev.evaluator_id ?? i}
                        title={`Interview opinion ${i + 1}`}
                        evaluator={ev.evaluator_name}
                        ciieId={ev.evaluator_ciie_id}
                        submittedAt={ev.submitted_at}
                        fields={row.interview_form_fields}
                        responses={ev.responses}
                        remarks={ev.remarks}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold text-slate-900">Decisions</h2>
          <div className="card divide-y divide-slate-100">
            {decided.map((row) => (
              <div key={row.application_id} className="space-y-2 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ApplicantInfo row={row} />
                  <StageBadge stage={row.stage} />
                </div>
                {row.stage === 'selected' && (
                  <div className="rounded-xl bg-green-50 px-4 py-3">
                    <p className="text-xs text-green-700">
                      Approved by {row.decided_by ?? '—'} on {row.decided_at ? new Date(row.decided_at).toLocaleString('en-IN') : '—'}
                    </p>
                    {row.final_message && (
                      <p className="mt-1 text-sm text-green-900">
                        <span className="font-semibold">Message: </span>
                        {row.final_message}
                      </p>
                    )}
                  </div>
                )}
                {row.stage === 'rejected' && (
                  <p className="text-xs text-slate-500">Rejected on {row.decided_at ? new Date(row.decided_at).toLocaleString('en-IN') : '—'}</p>
                )}
                <div className="grid gap-3 lg:grid-cols-2">
                  <ResponsesView
                    title="GD round"
                    evaluator={row.gd_evaluator}
                    fields={row.gd_form_fields}
                    responses={row.gd_responses}
                    remarks={row.gd_remarks}
                  />
                  {(row.interview_evaluations ?? []).length === 0 ? (
                    <ResponsesView title="Interview round" fields={row.interview_form_fields} />
                  ) : (
                    (row.interview_evaluations ?? []).map((ev, i) => (
                      <ResponsesView
                        key={ev.evaluator_id ?? i}
                        title={`Interview opinion ${i + 1}`}
                        evaluator={ev.evaluator_name}
                        ciieId={ev.evaluator_ciie_id}
                        submittedAt={ev.submitted_at}
                        fields={row.interview_form_fields}
                        responses={ev.responses}
                        remarks={ev.remarks}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal open={!!approving} onClose={() => setApproving(null)} title={`Approve — ${approving?.full_name ?? ''}`}>
        {approving && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800">
              <Mail size={16} className="shrink-0" />
              A congratulations email will be sent to the applicant.
            </div>
            <div>
              <p className="label">Congratulation message *</p>
              <TextArea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. We are thrilled to have you on the team. Welcome aboard!"
              />
              <p className="mt-1 text-xs text-slate-400">Shown in the email, followed by "Regards, KL CIIE".</p>
            </div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button className="w-full" disabled={busy} onClick={() => void approve()}>
              {busy ? <Spinner className="border-white/40 border-t-white" /> : (
                <>
                  <CheckCircle2 size={16} /> Approve &amp; send email
                </>
              )}
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={requesting} onClose={() => setRequesting(false)} title="Request reject-all permission">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            An admin must approve before you can reject every remaining applicant in Final Selection. Approved applicants are kept.
          </p>
          <div>
            <p className="label">Reason (optional)</p>
            <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do you want to reject all remaining applicants?" />
          </div>
          {rejectError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{rejectError}</p>}
          <Button className="w-full" disabled={rejectBusy} onClick={() => void requestRejectAll()}>
            {rejectBusy ? <Spinner className="border-white/40 border-t-white" /> : 'Send request'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
