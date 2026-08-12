import { useEffect, useState } from 'react'
import { Award, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Field, PageHeader, PageLoader, SelectInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Certificate, Event, EventRegistration } from '@/lib/types'
import { errorMessage, formatDate } from '@/lib/utils'

interface AttendanceRow {
  id: string
  member_id: string | null
  registration: Pick<EventRegistration, 'id' | 'member_id' | 'attendee_name' | 'registration_code'> | null
}

interface CertRow extends Certificate {
  member?: { id: string; full_name: string } | null
  registration?: Pick<EventRegistration, 'id' | 'attendee_name'> | null
}

const genCertCode = () => `CERT-${new Date().getFullYear()}-${String(Math.floor(100000 + Math.random() * 900000))}`

export default function Certificates() {
  const { user } = useAuth()
  const [events, setEvents] = useState<Event[]>([])
  const [eventId, setEventId] = useState('')
  const [present, setPresent] = useState<AttendanceRow[]>([])
  const [certs, setCerts] = useState<CertRow[]>([])
  const [issued, setIssued] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('events')
      .select('id, title, status, start_date')
      .in('status', ['published', 'completed'])
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        setEvents((data ?? []) as Event[])
        if ((data ?? []).length > 0) setEventId((data![0] as Event).id)
        setLoading(false)
      })
  }, [])

  const loadEvent = async (id: string) => {
    if (!id) return
    const [attResult, certResult] = await Promise.all([
      supabase
        .from('attendance')
        .select('id, member_id, registration:event_registrations(id, member_id, attendee_name, registration_code)')
        .eq('event_id', id)
        .eq('status', 'present'),
      supabase
        .from('certificates')
        .select('*, member:profiles!certificates_member_id_fkey(id, full_name), registration:event_registrations(id, attendee_name)')
        .eq('event_id', id)
        .order('issued_at', { ascending: false }),
    ])
    const presentRows = (attResult.data ?? []) as unknown as AttendanceRow[]
    const seen = new Set<string>()
    const deduped = presentRows.filter((p) => {
      const key = p.registration?.id ?? p.member_id ?? p.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    setPresent(deduped)
    setCerts((certResult.data ?? []) as CertRow[])
    const map: Record<string, boolean> = {}
    for (const c of (certResult.data ?? []) as CertRow[]) map[c.registration_id ?? ''] = true
    setIssued(map)
    setError('')
  }

  useEffect(() => {
    if (eventId) loadEvent(eventId)
  }, [eventId])

  const candidates = present.filter((a) => a.member_id && a.registration && !issued[a.registration!.id])
  const event = events.find((e) => e.id === eventId)

  const issueAll = async () => {
    if (!event || candidates.length === 0) return
    setBusy(true)
    setError('')
    const rows = candidates.map((a) => ({
      event_id: event.id,
      member_id: a.member_id!,
      registration_id: a.registration!.id,
      certificate_code: genCertCode(),
      title: `${event.title} — Certificate of Participation`,
      issued_by: user?.id ?? null,
    }))
    const { error } = await supabase.from('certificates').insert(rows)
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Certificates Issued', p_entity_type: 'event', p_entity_id: event.id, p_details: { count: rows.length } })
    loadEvent(event.id)
  }

  const revoke = async (c: CertRow) => {
    if (!window.confirm('Revoke this certificate?')) return
    const { error } = await supabase.from('certificates').delete().eq('id', c.id)
    if (error) {
      setError(errorMessage(error))
      return
    }
    loadEvent(c.event_id!)
  }

  if (loading) return <PageLoader />

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Certificates"
        subtitle="Issue certificates to present attendees. Codes are unique and verifiable."
        actions={
          <Button onClick={issueAll} disabled={busy || candidates.length === 0}>
            <Award size={15} /> Issue {candidates.length} certificate{candidates.length === 1 ? '' : 's'}
          </Button>
        }
      />

      <div className="card mb-6 p-4">
        <Field label="Select event">
          <SelectInput value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Choose an event…</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} • {formatDate(e.start_date)}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="font-bold text-slate-900">Issued certificates ({certs.length})</h2>
          </div>
          {certs.length === 0 ? (
            <EmptyState title="No certificates issued" />
          ) : (
            <div className="divide-y divide-slate-100">
              {certs.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{c.member?.full_name ?? 'Member'}</p>
                    <p className="text-xs text-slate-400">
                      <code>{c.certificate_code}</code> • {formatDate(c.issued_at)}
                    </p>
                  </div>
                  <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => revoke(c)} title="Revoke">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="font-bold text-slate-900">Ready to issue ({candidates.length})</h2>
          </div>
          {candidates.length === 0 ? (
            <EmptyState title="No eligible attendees" subtitle="Mark attendance as present for this event first." />
          ) : (
            <div className="divide-y divide-slate-100">
              {candidates.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{a.registration?.attendee_name}</p>
                    <p className="text-xs text-slate-400">
                      <code>{a.registration?.registration_code}</code>
                    </p>
                  </div>
                  <Badge tone="green">present</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
