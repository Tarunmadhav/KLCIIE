import { useEffect, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Mail,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import { Button, Field, PageHeader, Spinner, TextInput, Toggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { SmtpSetting } from '@/lib/types'
import { cn, errorMessage } from '@/lib/utils'

interface Draft {
  key: string
  id?: string
  email: string
  password: string
  from_name: string
  host: string
  port: string
  is_active: boolean
  show: boolean
}

function toDraft(s: SmtpSetting): Draft {
  return {
    key: s.id ?? `new_${Math.random().toString(36).slice(2)}`,
    id: s.id,
    email: s.email,
    password: s.password,
    from_name: s.from_name,
    host: s.host,
    port: String(s.port),
    is_active: s.is_active,
    show: false,
  }
}

export default function SmtpSettings() {
  const [rows, setRows] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [testBusy, setTestBusy] = useState<string | null>(null)
  const [testRecipient, setTestRecipient] = useState('')
  const [testResult, setTestResult] = useState<{ key: string; ok: boolean; message: string } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase.rpc('get_smtp_settings')
    if (err) {
      setError(errorMessage(err))
    } else {
      setRows(((data ?? []) as SmtpSetting[]).map(toDraft))
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const update = (key: string, patch: Partial<Draft>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    setSaved(false)
  }

  const add = () => {
    setRows((prev) => [
      ...prev,
      {
        key: `new_${Math.random().toString(36).slice(2)}`,
        email: '',
        password: '',
        from_name: 'KL CIIE',
        host: 'smtp.gmail.com',
        port: '465',
        is_active: true,
        show: false,
      },
    ])
    setSaved(false)
  }

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= rows.length) return
    setRows((prev) => {
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
    setSaved(false)
  }

  const remove = async (row: Draft) => {
    if (row.id && !window.confirm(`Remove ${row.email} from the SMTP pool?`)) return
    if (row.id) {
      const { error: err } = await supabase.rpc('delete_smtp_setting', { p_id: row.id })
      if (err) {
        setError(errorMessage(err))
        return
      }
    }
    setRows((prev) => prev.filter((r) => r.key !== row.key))
    setSaved(false)
  }

  const save = async () => {
    setBusy(true)
    setError('')
    setSaved(false)
    const payload = rows.map((r, i) => ({
      id: r.id ?? null,
      email: r.email.trim(),
      password: r.password,
      from_name: r.from_name.trim(),
      host: r.host.trim(),
      port: Number(r.port) || 465,
      is_active: r.is_active,
      position: i,
    }))
    const { data, error: err } = await supabase.rpc('save_smtp_settings', { p_settings: payload })
    setBusy(false)
    if (err) {
      setError(errorMessage(err))
      return
    }
    const savedList = (data ?? []) as Array<Partial<SmtpSetting> & { id: string }>
    setRows((prev) =>
      prev.map((r, i) => {
        const savedRow = savedList[i]
        return savedRow?.id
          ? { ...r, id: savedRow.id, email: savedRow.email ?? r.email, from_name: savedRow.from_name ?? r.from_name, host: savedRow.host ?? r.host, port: String(savedRow.port ?? r.port), is_active: savedRow.is_active ?? r.is_active }
          : r
      }),
    )
    setSaved(true)
    setTestResult(null)
  }

  const sendTest = async (row: Draft) => {
    if (!testRecipient.trim()) {
      setError('Enter a test recipient email first.')
      return
    }
    if (!row.id) {
      setError('Save the SMTP account before testing it.')
      return
    }
    setTestBusy(row.key)
    setError('')
    setTestResult(null)
    const { error: err } = await supabase.functions.invoke('send-recruit-email', {
      body: {
        to_email: testRecipient.trim(),
        subject: 'KL CIIE — SMTP test email',
        text: 'SMTP test — this Gmail SMTP account works correctly.',
        html: '<div style="font-family:Arial,sans-serif;padding:24px;color:#0f172a"><h3>SMTP test</h3><p>This Gmail SMTP account works correctly.</p><p>Regards,<br/><strong>KL CIIE</strong></p></div>',
        smtp_id: row.id,
      },
    })
    setTestBusy(null)
    if (err) {
      setTestResult({ key: row.key, ok: false, message: errorMessage(err) })
      return
    }
    setTestResult({ key: row.key, ok: true, message: `Sent to ${testRecipient.trim()}. Check the inbox.` })
  }

  return (
    <div>
      <PageHeader
        title="Email Settings"
        subtitle={`Gmail SMTP accounts used for all emails. Failover tries #1, then #2, then #3 … silently — the user only sees an error if every account fails (${rows.length} configured).`}
        actions={
          <Button onClick={add}>
            <Plus size={16} /> Add SMTP
          </Button>
        }
      />

      <div className="mb-5 flex items-start gap-2 rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Gmail setup</p>
          <p className="mt-0.5 text-primary-700/90">
            Enable 2-Step Verification on each Gmail account, then create an App Password (Google Account → Security →
            App passwords) and paste it here. Port 465 (SSL) is used by default. Emails are sent by the{' '}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">send-recruit-email</code> Edge Function,
            which reads this pool on every send.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-7 w-7" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Mail size={22} />
          </div>
          <p className="text-sm font-semibold text-slate-700">No SMTP accounts yet</p>
          <p className="max-w-sm text-sm text-slate-500">
            Add your first Gmail SMTP account. OTP emails for Join CIIE and role registration are sent with these
            accounts in order, so position matters.
          </p>
          <Button onClick={add}>
            <Plus size={16} /> Add the first SMTP account
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((row, i) => (
            <div key={row.key} className="card p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-sm font-black text-primary-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{row.email || 'New SMTP account'}</p>
                    <p className="text-[11px] text-slate-400">
                      {row.host}:{row.port} · {row.is_active ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title="Move up (tried earlier)">
                    <ChevronUp size={16} />
                  </button>
                  <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} title="Move down (tried later)">
                    <ChevronDown size={16} />
                  </button>
                  <button className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" onClick={() => void remove(row)} title="Remove">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Gmail address (SMTP user)">
                  <TextInput
                    value={row.email}
                    onChange={(e) => update(row.key, { email: e.target.value })}
                    placeholder="ciie.smtp1@gmail.com"
                  />
                </Field>
                <Field label="App password">
                  <div className="relative">
                    <TextInput
                      type={row.show ? 'text' : 'password'}
                      value={row.password}
                      onChange={(e) => update(row.key, { password: e.target.value })}
                      placeholder="16-character app password"
                      className="pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                      onClick={() => update(row.key, { show: !row.show })}
                      title={row.show ? 'Hide password' : 'Show password'}
                    >
                      {row.show ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>
                <Field label="From name">
                  <TextInput value={row.from_name} onChange={(e) => update(row.key, { from_name: e.target.value })} placeholder="KL CIIE" />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Host">
                    <TextInput value={row.host} onChange={(e) => update(row.key, { host: e.target.value })} placeholder="smtp.gmail.com" />
                  </Field>
                  <Field label="Port">
                    <TextInput
                      value={row.port}
                      onChange={(e) => update(row.key, { port: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                      inputMode="numeric"
                      placeholder="465"
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <Toggle checked={row.is_active} onChange={(v) => update(row.key, { is_active: v })} label="Active (included in the send pool)" />
                {row.id && (
                  <Button
                    variant="ghost"
                    onClick={() => void sendTest(row)}
                    disabled={testBusy !== null || !testRecipient.trim()}
                  >
                    {testBusy === row.key ? <Spinner className="h-4 w-4" /> : <Send size={15} />} Test this account
                  </Button>
                )}
              </div>

              {testResult?.key === row.key && (
                <p
                  className={cn(
                    'mt-3 rounded-lg px-3 py-2 text-sm',
                    testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
                  )}
                >
                  {testResult.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 max-w-md">
        <Field label="Test recipient" hint="Used by the 'Test this account' buttons.">
          <TextInput type="email" value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="you@example.com" />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <Button onClick={() => void save()} disabled={busy || rows.length === 0}>
          {busy ? <Spinner className="border-white/40 border-t-white" /> : <Save size={16} />} Save SMTP accounts
        </Button>
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <KeyRound size={13} /> {rows.length} account{rows.length === 1 ? '' : 's'} · used in list order
        </p>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">SMTP accounts saved.</p>}
    </div>
  )
}
