import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react'
import { Badge, Button, EmptyState, PageHeader, PageLoader, Spinner } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { RecruitRejectRequest } from '@/lib/types'
import { errorMessage, formatDateTime } from '@/lib/utils'

const STATUS_META: Record<RecruitRejectRequest['status'], { label: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  pending: { label: 'Pending', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  denied: { label: 'Denied', tone: 'red' },
  used: { label: 'Used', tone: 'slate' },
}

export default function RejectPermissions() {
  const [requests, setRequests] = useState<RecruitRejectRequest[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('recruit_reject_requests')
      .select('*, requester:profiles!recruit_reject_requests_requested_by_fkey(full_name, email, ciie_id)')
      .order('created_at', { ascending: false })
    setRequests((data as RecruitRejectRequest[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (id: string, approved: boolean) => {
    setBusyId(id)
    setError('')
    const { error: err } = await supabase.rpc('decide_reject_request', { p_request_id: id, p_approved: approved })
    setBusyId(null)
    if (err) {
      setError(errorMessage(err))
      return
    }
    await load()
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Reject-All Permissions"
        subtitle="CIIE members need your approval before they can reject every remaining applicant in Final Selection."
      />

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {requests.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={36} />}
          title="No requests yet"
          subtitle="When a CIIE member asks to reject all remaining applicants, their request appears here."
        />
      ) : (
        <div className="card divide-y divide-slate-100">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{r.requester?.full_name ?? 'Unknown member'}</p>
                <p className="text-xs text-slate-500">
                  {r.requester?.email ?? ''} {r.requester?.ciie_id ? `• ${r.requester.ciie_id}` : ''}
                </p>
                <p className="text-xs text-slate-400">Requested {formatDateTime(r.created_at)}</p>
                {r.reason && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">"{r.reason}"</p>}
                {r.status !== 'pending' && r.decided_at && (
                  <p className="mt-1 text-[11px] text-slate-400">Decided {formatDateTime(r.decided_at)}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={STATUS_META[r.status].tone}>{STATUS_META[r.status].label}</Badge>
                {r.status === 'pending' && (
                  <>
                    <Button
                      className="!px-3 !py-1.5 text-xs"
                      disabled={busyId === r.id}
                      onClick={() => void decide(r.id, true)}
                    >
                      {busyId === r.id ? <Spinner className="border-white/40 border-t-white" /> : <CheckCircle2 size={14} />} Approve
                    </Button>
                    <Button
                      variant="danger"
                      className="!px-3 !py-1.5 text-xs"
                      disabled={busyId === r.id}
                      onClick={() => void decide(r.id, false)}
                    >
                      <XCircle size={14} /> Deny
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
