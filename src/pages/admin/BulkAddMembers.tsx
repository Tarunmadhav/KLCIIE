import { useCallback, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ClipboardCopy,
  Copy,
  Download,
  FileSpreadsheet,
  Info,
  MailCheck,
  RotateCcw,
  TriangleAlert,
  Upload,
  UserPlus,
  XCircle,
} from 'lucide-react'
import { Badge, Button, Modal, PageHeader, SelectInput } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS } from '@/lib/types'
import { downloadExcel } from '@/lib/excel'
import { cn, digitsOnly, emailInvokeMessage, errorMessage } from '@/lib/utils'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CHUNK_SIZE = 15

type Phase = 'upload' | 'preview' | 'working' | 'done'

interface ParsedRow {
  index: number
  fullName: string
  email: string
  studentId: string
  department: string
  yearOfStudy: string
  phone: string
  error: string | null
}

interface ResultRow extends ParsedRow {
  status: 'created' | 'failed' | 'pending'
  password?: string
  mailStatus?: 'sent' | 'failed'
  resultError?: string
  role?: string
}

const IMPORTABLE_ROLES = ['user', 'member', 'member_ciie', 'faculty'] as const

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z]/g, '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function mapHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const h of headers) {
    const n = normHeader(String(h))
    if (!n) continue
    if (map.student === undefined && (n.includes('studentid') || n.includes('idnumber') || n === 'id' || n.includes('rollno') || n.includes('rollnumber') || n.includes('hallticket'))) map.student = h
    else if (map.phone === undefined && (n.includes('mobile') || n.includes('phone') || n.includes('whatsapp') || n.includes('contactno') || n === 'contact')) map.phone = h
    else if (map.email === undefined && (n.includes('email') || n === 'mail' || n.includes('mailid'))) map.email = h
    else if (map.name === undefined && n.includes('name')) map.name = h
    else if (map.department === undefined && (n.includes('dept') || n.includes('department') || n.includes('branch'))) map.department = h
    else if (map.year === undefined && n.includes('year')) map.year = h
  }
  return map
}

export default function BulkAddMembers() {
  const [phase, setPhase] = useState<Phase>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importRole, setImportRole] = useState<(typeof IMPORTABLE_ROLES)[number]>('user')

  const [stage, setStage] = useState<'create' | 'mail'>('create')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<ResultRow[]>([])
  const [showPasswords, setShowPasswords] = useState(true)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const validRows = useMemo(() => rows.filter((r) => !r.error), [rows])
  const invalidCount = rows.length - validRows.length

  const created = useMemo(() => results.filter((r) => r.status === 'created'), [results])
  const mailSent = created.filter((r) => r.mailStatus === 'sent').length
  const mailFailed = created.filter((r) => r.mailStatus === 'failed').length

  const parseFile = useCallback(async (file: File) => {
    setParseError('')
    setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const sheetName = wb.SheetNames[0]
      const sheet = sheetName ? wb.Sheets[sheetName] : null
      if (!sheet) throw new Error('The file has no sheets.')
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (raw.length === 0) throw new Error('No data rows found in the first sheet.')

      const headers = Object.keys(raw[0] ?? {})
      const col = mapHeaders(headers)
      const missing = ['name', 'student', 'email', 'phone'].filter((k) => !col[k])
      if (missing.length > 0) {
        throw new Error(
          `Could not find these required column(s): ${missing
            .map((m) => ({ name: 'Name', student: 'Id Number', email: 'Email', phone: 'Mobile Number' })[m])
            .join(', ')}. Found columns: ${headers.join(', ')}.`,
        )
      }

      const emailsInFile = new Set<string>()
      const idsInFile = new Set<string>()

      const parsed: ParsedRow[] = raw.map((r, i) => {
        const fullName = String(r[col.name!] ?? '').replace(/\s+/g, ' ').trim()
        const email = String(r[col.email!] ?? '').trim().toLowerCase()
        const studentId = digitsOnly(String(r[col.student!] ?? ''))
        const phone = digitsOnly(String(r[col.phone!] ?? ''))
        const department = String(r[col.department ?? '__'] ?? '').trim()
        const yearOfStudy = String(r[col.year ?? '__'] ?? '').trim()

        let error: string | null = null
        if (!fullName) error = 'Name is missing.'
        else if (!EMAIL_RE.test(email)) error = 'Email is invalid.'
        else if (studentId.length !== 10) error = `Student ID must be exactly 10 digits (got ${studentId.length}).`
        else if (phone.length !== 10) error = `Phone number must be exactly 10 digits (got ${phone.length}).`
        else if (emailsInFile.has(email)) error = 'Duplicate email in this file.'
        else if (idsInFile.has(studentId)) error = 'Duplicate Student ID in this file.'
        emailsInFile.add(email)
        idsInFile.add(studentId)

        return { index: i + 1, fullName, email, studentId, department, yearOfStudy, phone, error }
      })

      // Flag rows that collide with accounts that already exist.
      const { data: existing } = await supabase.from('profiles').select('email, student_id')
      const dbEmails = new Set((existing ?? []).map((p) => String(p.email ?? '').trim().toLowerCase()))
      const dbIds = new Set((existing ?? []).map((p) => digitsOnly(p.student_id)))
      for (const row of parsed) {
        if (row.error) continue
        if (dbEmails.has(row.email)) row.error = 'An account with this email already exists.'
        else if (dbIds.has(row.studentId)) row.error = 'A member with this Student ID already exists.'
      }

      setRows(parsed)
      setPhase('preview')
    } catch (err) {
      setParseError(errorMessage(err))
      setRows([])
    }
  }, [])

  // Invoke one chunk; transient network failures ("Failed to send a request…")
  // are retried automatically — cold edge runtime / momentary blips recover.
  const invokeChunk = async (body: Record<string, unknown>) => {
    let lastError = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.functions.invoke('bulk-create-members', { body })
      if (!error) return data
      lastError = await emailInvokeMessage(error)
      if (!/failed to send a request|fetch failed|networkerror|load failed/i.test(lastError)) throw new Error(lastError)
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
    }
    throw new Error(
      `${lastError} — the Edge Function could not be reached after retries. Make sure the project is active and 'bulk-create-members' is deployed, then try again.`,
    )
  }

  const runImport = async () => {
    setConfirmOpen(false)
    setPhase('working')
    setStage('create')
    setProgress({ done: 0, total: validRows.length })
    const out: ResultRow[] = []

    for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + CHUNK_SIZE)
      try {
        const data = await invokeChunk({
          role: importRole,
          members: chunk.map((r, j) => ({
            client_index: i + j,
            full_name: r.fullName,
            email: r.email,
            student_id: r.studentId,
            department: r.department,
            year_of_study: r.yearOfStudy,
            phone: r.phone,
          })),
        })
        type ApiResult = { index: number; client_index: number | null; ok: boolean; error?: string; password?: string }
        const api = ((data as { results?: ApiResult[] })?.results ?? []) as ApiResult[]
        for (let j = 0; j < chunk.length; j++) {
          const match = api.find((a) => a.client_index === i + j)
          out.push({
            ...chunk[j],
            status: match?.ok ? 'created' : 'failed',
            password: match?.password,
            role: importRole,
            resultError: match?.ok ? undefined : match?.error ?? 'No response for this row.',
          })
        }
      } catch (err) {
        for (const r of chunk) out.push({ ...r, status: 'failed', role: importRole, resultError: errorMessage(err) })
      }
      setProgress({ done: Math.min(i + CHUNK_SIZE, validRows.length), total: validRows.length })
    }

    const mailList = out.filter((r) => r.status === 'created')
    setStage('mail')
    setProgress({ done: 0, total: mailList.length })
    let mailed = 0
    for (const r of mailList) {
      r.mailStatus = (await sendWelcomeMail(r)) ? 'sent' : 'failed'
      mailed += 1
      setProgress({ done: mailed, total: mailList.length })
    }

    setResults(out)
    setPhase('done')
  }

  const sendWelcomeMail = async (r: ResultRow): Promise<boolean> => {
    const loginUrl = `${window.location.origin}/login`
    const text =
      `Hi ${r.fullName},\n\n` +
      'Your KL CIIE account has been created.\n\n' +
      `Login Email: ${r.email}\n` +
      `Password: ${r.password}\n\n` +
      `Log in here: ${loginUrl}\n\n` +
      'Please keep this email safe and do not share your password.\n\n' +
      'Regards,\nKL CIIE'
    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">' +
      '<div style="background:#4f46e5;padding:20px 26px;text-align:center">' +
      '<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px">KL CIIE</span></div>' +
      `<div style="padding:26px;color:#0f172a;font-size:15px;line-height:1.6"><h2 style="margin:0 0 12px">Hi ${escapeHtml(r.fullName)},</h2>` +
      '<p style="margin:0 0 14px">Your KL CIIE account has been created. Use these details to log in:</p>' +
      '<table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px">' +
      `<tr><td style="padding:10px 14px;font-weight:600">Login Email</td><td style="padding:10px 14px">${escapeHtml(r.email)}</td></tr>` +
      `<tr><td style="padding:10px 14px;font-weight:600">Student ID</td><td style="padding:10px 14px">${escapeHtml(r.studentId)}</td></tr>` +
      `<tr><td style="padding:10px 14px;font-weight:600">Password</td><td style="padding:10px 14px"><strong style="font-family:monospace;font-size:16px">${escapeHtml(r.password ?? '')}</strong></td></tr>` +
      '</table>' +
      `<p style="margin:14px 0">Log in at <a href="${loginUrl}">${loginUrl}</a>.</p>` +
      '<p style="margin:0">Please keep this email safe and do not share your password.<br/><strong>KL CIIE</strong></p>' +
      '</div></div>'
    try {
      const { error } = await supabase.functions.invoke('send-recruit-email', {
        body: { to_email: r.email, subject: 'Your KL CIIE account', text, html },
      })
      return !error
    } catch {
      return false
    }
  }

  const resendMail = async (row: ResultRow) => {
    const ok = await sendWelcomeMail(row)
    setResults((prev) => prev.map((r) => (r.index === row.index ? { ...r, mailStatus: ok ? 'sent' : 'failed' } : r)))
  }

  const downloadTemplate = async () => {
    await downloadExcel(
      'ciie-bulk-add-members-template.xlsx',
      [{ Name: 'Rahul Kumar', 'Id Number': '2300123456', Email: 'rahul@kluniversity.in', Department: 'CSE', Year: '2nd Year', 'Mobile Number': '9876543210' }],
      'Members',
    )
  }

  const copyCredentials = async () => {
    const lines = created.map((r) => `${r.fullName}\t${r.email}\t${r.studentId}\t${r.password ?? ''}`)
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadCredentials = () => {
    void downloadExcel(
      `ciie-bulk-members-${new Date().toISOString().slice(0, 10)}.xlsx`,
      created.map((r) => ({
        Name: r.fullName,
        Email: r.email,
        'Student ID': r.studentId,
        Password: r.password ?? '',
        Role: ROLE_LABELS[(r.role ?? 'user') as keyof typeof ROLE_LABELS],
        Department: r.department,
        Year: r.yearOfStudy,
        Phone: r.phone,
        EmailStatus: r.mailStatus === 'sent' ? 'sent' : r.mailStatus === 'failed' ? 'failed' : '',
      })),
      'Credentials',
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Add Members"
        subtitle="Upload an Excel sheet of members — preview everyone, create their login accounts with random passwords, and email the credentials automatically."
        actions={
          <Button variant="ghost" onClick={() => void downloadTemplate()}>
            <Download size={15} /> Sample template
          </Button>
        }
      />

      {(phase === 'upload' || phase === 'preview') && (
        <div className="card p-6">
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
            <Upload size={16} className="text-primary-600" /> Upload Excel / CSV
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Required columns: <strong>Name</strong>, <strong>Id Number</strong> (Student ID), <strong>Email</strong>,{' '}
            <strong>Department</strong>, <strong>Year</strong>, <strong>Mobile Number</strong> (Phone). Student ID and
            phone must be exactly 10 digits. Extra columns are ignored.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
              <FileSpreadsheet size={16} /> Choose file…
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void parseFile(f)
                  e.target.value = ''
                }}
              />
            </label>
            {fileName && <span className="text-sm text-slate-500">{fileName}</span>}
            <div className="flex items-center gap-2">
              <label className="whitespace-nowrap text-sm font-semibold text-slate-700" htmlFor="bulk-import-role">
                Create accounts as
              </label>
              <div className="w-44">
                <SelectInput id="bulk-import-role" value={importRole} onChange={(e) => setImportRole(e.target.value as (typeof IMPORTABLE_ROLES)[number])}>
                  {IMPORTABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </SelectInput>
              </div>
            </div>
            {rows.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setPhase('upload')
                  setRows([])
                  setResults([])
                  setFileName('')
                  if (fileRef.current) fileRef.current.value = ''
                }}
              >
                Clear
              </Button>
            )}
          </div>

          {parseError && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {parseError}
            </p>
          )}

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800">
            <Info size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">What happens next</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-primary-700/90">
                <li>You review every person from the sheet before anything is created.</li>
                <li>Each member gets a login account with a random password.</li>
                <li>Welcome emails (email + name + password) are sent automatically.</li>
                <li>Gmail SMTP accounts rotate per email — mail #1 via account #1, mail #2 via account #2 … looping.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {phase === 'preview' && rows.length > 0 && (
        <div className="card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">
              Review before creating — {validRows.length} ready
              {invalidCount > 0 && <span className="text-red-600"> · {invalidCount} will be skipped</span>}
              <span className="ml-2 text-sm font-medium text-slate-500">· role: {ROLE_LABELS[importRole]}</span>
            </h2>
            <Button onClick={() => setConfirmOpen(true)} disabled={validRows.length === 0}>
              <UserPlus size={16} /> Create {validRows.length} account{validRows.length === 1 ? '' : 's'} &amp; send mails
            </Button>
          </div>

          <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Student ID</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Dept</th>
                  <th className="px-3 py-2">Year</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.index} className={cn(r.error && 'bg-red-50/70')}>
                    <td className="px-3 py-2 text-slate-400">{r.index}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{r.fullName || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.studentId || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.email}</td>
                    <td className="px-3 py-2 text-slate-600">{r.department || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.yearOfStudy || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.phone || '—'}</td>
                    <td className="px-3 py-2">
                      {r.error ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                          <XCircle size={13} /> {r.error}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600">
                          <CheckCircle2 size={13} /> Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invalidCount > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Rows with errors are skipped — fix them in your sheet and upload again. Only the {validRows.length} valid
              rows above will be created.
            </p>
          )}
        </div>
      )}

      {phase === 'working' && (
        <div className="card p-8">
          <div className="mx-auto max-w-md space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 text-base font-bold text-slate-900">
              <SpinnerSmall />
              {stage === 'create' ? 'Creating member accounts…' : 'Sending welcome emails…'}
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-primary-600 transition-all"
                style={{ width: `${progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
            <p className="text-sm text-slate-500">
              {progress.done} / {progress.total}{' '}
              {stage === 'mail' && progress.total === 0 && '— no accounts were created, skipping emails.'}
            </p>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="Created" value={created.length} tone="green" />
            <StatCard label="Failed" value={results.length - created.length} tone={results.length - created.length > 0 ? 'red' : 'slate'} />
            <StatCard label="Emails sent" value={mailSent} tone="green" />
            <StatCard label="Emails failed" value={mailFailed} tone={mailFailed > 0 ? 'amber' : 'slate'} />
          </div>

          {mailFailed > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Some welcome emails failed (SMTP issue or rate limit). Use the resend button next to those members below —
              account creation itself succeeded for every “Created” row.
            </p>
          )}
          <p className="flex items-start gap-2 rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800">
            <Info size={16} className="mt-0.5 shrink-0" />
            Passwords are shown here only while this page is open — they cannot be recovered later. Download the Excel
            file below to keep a permanent record.
          </p>

          <div className="card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">Accounts &amp; passwords ({created.length})</h2>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setShowPasswords((v) => !v)}>
                  {showPasswords ? 'Hide passwords' : 'Show passwords'}
                </Button>
                <Button variant="ghost" onClick={() => void copyCredentials()} disabled={copied}>
                  {copied ? <ClipboardCopy size={15} /> : <Copy size={15} />} {copied ? 'Copied!' : 'Copy all'}
                </Button>
                <Button onClick={downloadCredentials} disabled={created.length === 0}>
                  <Download size={15} /> Download credentials Excel
                </Button>
              </div>
            </div>

            <div className="max-h-[32rem] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Student ID</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Password</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((r) => (
                    <tr key={r.index} className={cn(r.status === 'failed' && 'bg-red-50/70')}>
                      <td className="px-3 py-2 text-slate-400">{r.index}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.fullName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.studentId}</td>
                      <td className="px-3 py-2 text-slate-600">{r.email}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.status === 'created' ? (showPasswords ? r.password : '••••••••') : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === 'created' ? (
                          <Badge tone="green">Created</Badge>
                        ) : (
                          <Badge tone="red" className="max-w-56 truncate" >
                            <XCircle size={12} /> {r.resultError}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.status !== 'created' ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : r.mailStatus === 'sent' ? (
                          <Badge tone="green"><MailCheck size={12} /> Sent</Badge>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Badge tone="red">Failed</Badge>
                            <button
                              className="inline-flex items-center gap-1 rounded-lg p-1 text-primary-600 hover:bg-primary-50"
                              title="Resend welcome email"
                              onClick={() => void resendMail(r)}
                            >
                              <RotateCcw size={13} />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setPhase('upload')
                setRows([])
                setResults([])
                setFileName('')
              }}
            >
              Import another batch
            </Button>
          </div>
        </>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Create accounts?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void runImport()}>
              <UserPlus size={16} /> Yes, create {validRows.length} account{validRows.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm text-slate-600">
          <li>• {validRows.length} login account(s) will be created with random passwords.</li>
          <li>
            • Every account will be created with the role{' '}
            <strong className="text-slate-900">{ROLE_LABELS[importRole]}</strong>.
          </li>
          <li>• A welcome email with name, email and password will be sent to each member.</li>
          <li>• Emails rotate across your configured Gmail SMTP accounts automatically.</li>
          <li>• This can take several minutes for large batches — keep this page open.</li>
        </ul>
      </Modal>
    </div>
  )
}

function SpinnerSmall() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-primary-600" />
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'green' | 'red' | 'amber' | 'slate' }) {
  const tones = {
    green: 'border-green-200 bg-green-50 text-green-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
  }
  return (
    <div className={cn('rounded-xl border px-4 py-3', tones[tone])}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  )
}
