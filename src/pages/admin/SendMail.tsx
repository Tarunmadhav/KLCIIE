import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, Info, Mail, RefreshCw, Search, Send, Users } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  PageLoader,
  SelectInput,
  Spinner,
  TextArea,
  TextInput,
} from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ADMIN_ROLES, isAdminRole, type Profile } from '@/lib/types'
import { cn, errorMessage, formatDateTime } from '@/lib/utils'

type Audience = 'all' | 'ciie' | 'admins' | 'recruits' | 'pick' | 'custom'

interface Recipient {
  email: string
  name: string | null
}

interface MailLogRow {
  id: string
  to_email: string
  subject: string
  status: 'sent' | 'failed'
  error: string | null
  smtp_email: string | null
  sent_at: string
  actor?: { full_name: string | null } | null
}

const AUDIENCE_OPTIONS: Array<{ value: Audience; label: string }> = [
  { value: 'all', label: 'Everyone with an email' },
  { value: 'ciie', label: 'All CIIE members' },
  { value: 'admins', label: 'All admins' },
  { value: 'recruits', label: 'All recruits / applicants' },
  { value: 'pick', label: 'Choose specific people…' },
  { value: 'custom', label: 'Custom email addresses…' },
]

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlFromText(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const body = paragraphs.length
    ? paragraphs.map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br/>')}</p>`).join('')
    : ''
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">' +
    '<div style="background:#4f46e5;padding:20px 26px;text-align:center">' +
    '<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px">KL CIIE</span></div>' +
    `<div style="padding:26px;color:#0f172a;font-size:15px;line-height:1.6">${body}</div>` +
    '</div>'
  )
}

function firstEmail(value: string | null): Recipient | null {
  const email = (value ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email, name: null } : null
}

export default function SendMail() {
  const [audience, setAudience] = useState<Audience>('all')
  const [customEmails, setCustomEmails] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const [people, setPeople] = useState<Profile[]>([])
  const [peopleLoading, setPeopleLoading] = useState(true)
  const [pickQ, setPickQ] = useState('')
  const [picked, setPicked] = useState<Record<string, Recipient>>({})

  const [log, setLog] = useState<MailLogRow[]>([])
  const [logLoading, setLogLoading] = useState(true)

  const [showConfirm, setShowConfirm] = useState(false)
  const [pending, setPending] = useState<Recipient[]>([])
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [failed, setFailed] = useState<Recipient[]>([])
  const [error, setError] = useState('')
  const [sentBanner, setSentBanner] = useState(false)

  const loadPeople = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .not('email', 'is', null)
      .order('full_name')
    if (!err && data) {
      setPeople(data as Profile[])
    }
  }, [])

  const loadLog = useCallback(async () => {
    setLogLoading(true)
    const { data, error: err } = await supabase
      .from('recruit_emails')
      .select('id, to_email, subject, status, error, smtp_email, sent_at, actor:profiles!sent_by(full_name)')
      .order('sent_at', { ascending: false })
      .limit(20)
    if (err) {
      setError(errorMessage(err))
    } else {
      setLog((data ?? []) as unknown as MailLogRow[])
    }
    setLogLoading(false)
  }, [])

  useEffect(() => {
    void Promise.all([loadPeople(), loadLog()]).finally(() => setPeopleLoading(false))
  }, [loadPeople, loadLog])

  const filteredPeople = useMemo(() => {
    const q = pickQ.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => `${p.full_name ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q))
  }, [people, pickQ])

  const recipientCount = useMemo(() => {
    if (audience === 'custom') return (customEmails.match(/[\s,;]+/) ? customEmails.split(/[\s,;]+/) : [customEmails]).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())).length
    if (audience === 'pick') return Object.keys(picked).length
    if (audience === 'ciie') return people.filter((p) => p.role === 'member_ciie').length
    if (audience === 'admins') return people.filter((p) => isAdminRole(p.role)).length
    if (audience === 'recruits') return people.filter((p) => p.role === 'member').length
    return people.length
  }, [audience, customEmails, picked, people])

  const resolveRecipients = useCallback(async (): Promise<Recipient[]> => {
    let list: Recipient[] = []
    if (audience === 'custom') {
      list = (customEmails.split(/[\s,;]+/) as string[])
        .map((e) => firstEmail(e))
        .filter((r): r is Recipient => r !== null)
    } else if (audience === 'pick') {
      list = Object.values(picked)
    } else {
      let query = supabase.from('profiles').select('id, email, full_name, role').not('email', 'is', null)
      if (audience === 'ciie') query = query.eq('role', 'member_ciie')
      else if (audience === 'admins') query = query.in('role', ADMIN_ROLES)
      else if (audience === 'recruits') query = query.eq('role', 'member')
      const { data, error: err } = await query
      if (err) throw new Error(errorMessage(err))
      list = ((data ?? []) as Array<{ email: string | null; full_name: string | null }>)
        .map((p) => {
          const email = firstEmail(p.email)
          return email ? { ...email, name: p.full_name } : null
        })
        .filter((r): r is Recipient => r !== null)
    }
    const seen = new Set<string>()
    return list.filter((r) => {
      const key = r.email.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [audience, customEmails, picked])

  const togglePick = (p: Profile) => {
    setPicked((prev) => {
      const next = { ...prev }
      const email = firstEmail(p.email)
      if (next[p.id]) {
        delete next[p.id]
      } else if (email) {
        next[p.id] = { ...email, name: p.full_name }
      }
      return next
    })
  }

  const send = async () => {
    setError('')
    setSentBanner(false)
    if (!subject.trim()) {
      setError('Add a subject line.')
      return
    }
    if (!body.trim()) {
      setError('Write a message first.')
      return
    }
    let recipients: Recipient[]
    try {
      recipients = await resolveRecipients()
    } catch (err) {
      setError(errorMessage(err))
      return
    }
    if (recipients.length === 0) {
      setError('No recipients match the selected audience.')
      return
    }
    setPending(recipients)
    setShowConfirm(true)
  }

  const doSend = async () => {
    const recipients = pending
    setSending(true)
    setFailed([])
    setProgress({ done: 0, total: recipients.length })
    const baseSubject = subject.trim()
    const baseBody = body.trim().replace(/\r\n/g, '\n')
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]
      const name = (r.name ?? '').trim().split(/\s+/)[0] ?? ''
      const personal = baseSubject.split('{name}').join(name)
      const text = baseBody.split('{name}').join(name)
      const html = htmlFromText(escapeHtml(text))
      try {
        const { error: err } = await supabase.functions.invoke('send-recruit-email', {
          body: { to_email: r.email, subject: personal, text, html },
        })
        if (err) throw new Error(errorMessage(err))
      } catch {
        setFailed((prev) => [...prev, r])
      }
      setProgress({ done: i + 1, total: recipients.length })
    }
    setSending(false)
    setShowConfirm(false)
    setSentBanner(true)
    await loadLog()
  }

  if (peopleLoading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Send Email"
        subtitle="Compose and send emails to members, recruits, admins or any address through the configured Gmail SMTP pool."
        actions={
          <Button variant="ghost" onClick={() => void loadLog()} disabled={logLoading || sending}>
            <RefreshCw size={15} /> Refresh log
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <div className="card space-y-5 p-5">
            <Field label="Audience" hint="Who should receive this email?">
              <SelectInput value={audience} onChange={(e) => setAudience(e.target.value as Audience)} disabled={sending}>
                {AUDIENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectInput>
            </Field>

            {audience === 'pick' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <TextInput className="!pl-9" placeholder="Search people by name or email…" value={pickQ} onChange={(e) => setPickQ(e.target.value)} disabled={sending} />
                </div>
                <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200">
                  {filteredPeople.length === 0 ? (
                    <p className="p-4 text-sm text-slate-400">No people match.</p>
                  ) : (
                    filteredPeople.map((p) => {
                      const active = !!picked[p.id]
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={sending}
                          onClick={() => togglePick(p)}
                          className={cn(
                            'flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 text-left text-sm transition last:border-0',
                            active ? 'bg-primary-50' : 'hover:bg-slate-50',
                          )}
                        >
                          <span className="min-w-0">
                            <span className={cn('block truncate font-medium', active ? 'text-primary-800' : 'text-slate-700')}>{p.full_name ?? '—'}</span>
                            <span className="block truncate text-xs text-slate-400">{p.email}</span>
                          </span>
                          <span
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold',
                              active ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300 text-transparent',
                            )}
                          >
                            ✓
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {Object.keys(picked).length} selected · use <code className="rounded bg-slate-100 px-1">/admin/send-mail</code> presets for whole groups.
                </p>
              </div>
            )}

            {audience === 'custom' && (
              <Field label="Recipients" hint="One email per line, or comma separated.">
                <TextArea
                  rows={4}
                  value={customEmails}
                  onChange={(e) => setCustomEmails(e.target.value)}
                  placeholder={'member1@example.com\nmember2@example.com'}
                  disabled={sending}
                />
              </Field>
            )}

            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <Users size={16} className="shrink-0 text-slate-400" />
              <span>
                <strong className="text-slate-900">{recipientCount}</strong> recipient{recipientCount === 1 ? '' : 's'}
              </span>
            </div>

            <div className="rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800">
              <div className="flex items-start gap-2">
                <Info size={16} className="mt-0.5 shrink-0" />
                <p>
                  Write <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">{'{name}'}</code> anywhere in the subject or
                  message to insert each recipient's first name. Every send is recorded in the mail log below.
                </p>
              </div>
            </div>

            <Field label="Subject">
              <TextInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Important update from KL CIIE" disabled={sending} />
            </Field>

            <Field label="Message">
              <TextArea rows={9} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" disabled={sending} />
            </Field>

            <div className="flex items-center gap-4">
              <Button onClick={() => void send()} disabled={sending}>
                {sending ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : <Send size={15} />}
                {sending ? `Sending ${progress.done}/${progress.total}…` : 'Send email'}
              </Button>
              {sending && (
                <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-primary-600 transition-all"
                    style={{ width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%' }}
                  />
                </div>
              )}
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {sentBanner && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                Email{progress.total === 1 ? '' : 's'} sent{failed.length ? ` — ${failed.length} failed` : ''}.
              </p>
            )}
            {failed.length > 0 && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <p className="font-semibold">Failed to send to:</p>
                <ul className="mt-1 list-inside list-disc">
                  {failed.map((f) => (
                    <li key={f.email}>{f.email}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
                <History size={15} /> Recent mail log
              </h2>
            </div>
            {logLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-6 w-6" />
              </div>
            ) : log.length === 0 ? (
              <EmptyState icon={<Mail size={32} />} title="No emails sent yet" subtitle="Sent emails and failed attempts appear here." />
            ) : (
              <ul className="space-y-3">
                {log.map((row) => (
                  <li key={row.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={row.status === 'sent' ? 'green' : 'red'}>{row.status}</Badge>
                      <span className="text-[10px] text-slate-400">{formatDateTime(row.sent_at)}</span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-semibold text-slate-800">{row.subject}</p>
                    <p className="truncate text-xs text-slate-500">{row.to_email}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                      <span>by {row.actor?.full_name ?? 'system'}</span>
                      {row.smtp_email && <span>· via {row.smtp_email}</span>}
                    </div>
                    {row.status === 'failed' && row.error && <p className="mt-1 truncate text-[10px] text-red-500">{row.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={showConfirm}
        onClose={() => !sending && setShowConfirm(false)}
        title="Confirm send"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowConfirm(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={() => void doSend()} disabled={sending}>
              {sending ? <Spinner className="h-4 w-4 border-white/40 border-t-white" /> : <Send size={15} />}
              Send to {progress.total || pending.length} recipient{progress.total || pending.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This will email <strong className="text-slate-900">{progress.total || pending.length}</strong> recipient
          {progress.total || pending.length === 1 ? '' : 's'}:
        </p>
        <div className="mt-3 flex max-h-48 flex-wrap gap-1 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {pending.length === 0 ? (
            <p className="text-sm text-slate-400">No recipients.</p>
          ) : (
            pending.slice(0, 30).map((r) => (
              <span key={r.email} className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {r.email}
              </span>
            ))
          )}
        </div>
        {pending.length > 30 && <p className="mt-1 text-xs text-slate-400">… and {pending.length - 30} more.</p>}
      </Modal>
    </div>
  )
}
