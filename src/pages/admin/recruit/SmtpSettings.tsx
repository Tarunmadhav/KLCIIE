import { useState } from 'react'
import { KeyRound, Send, TerminalSquare } from 'lucide-react'
import { Button, Field, PageHeader, Spinner, TextInput } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'

export default function SmtpSettings() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const sendTest = async () => {
    if (!email.trim()) {
      setError('Enter a recipient email address.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    const { error: err } = await supabase.functions.invoke('send-recruit-email', {
      body: {
        to_email: email.trim(),
        subject: 'KL CIIE — SMTP test email',
        text: 'SMTP test — your SMTP settings work correctly.',
        html: '<div style="font-family:Arial,sans-serif;padding:24px;color:#0f172a"><h3>SMTP test</h3><p>Your SMTP settings work correctly.</p><p>Regards,<br/><strong>KL CIIE</strong></p></div>',
      },
    })
    setBusy(false)
    if (err) {
      setError(`Test email failed: ${errorMessage(err)}`)
      return
    }
    setMessage('Test email sent. Check the recipient inbox.')
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Email Settings"
        subtitle="SMTP credentials for the recruitment emails are managed with environment secrets — never in the database."
      />

      <div className="card space-y-5 p-6">
        <p className="flex items-start gap-2 rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800">
          <TerminalSquare size={16} className="mt-0.5 shrink-0" />
          Emails are sent by the <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">send-recruit-email</code>{' '}
          Edge Function. Put SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM in your{' '}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">.env</code> file, then push them with:
        </p>
        <pre className="overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 font-mono text-xs text-slate-200">
          npx supabase login{'\n'}
          npx supabase link --project-ref &lt;project-ref&gt;{'\n'}
          npx supabase secrets set --env-file .env{'\n'}
          npx supabase functions deploy send-recruit-email
        </pre>

        <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <KeyRound size={14} className="mt-0.5 shrink-0" />
          Gmail: enable 2-Step Verification, then create an App Password (Google Account → Security → App passwords).
          Use port 465 — Supabase Edge Functions only allow outbound calls to ports other than 25 and 587.
        </p>

        <div>
          <Field label="Recipient email *" hint="Send a test email to verify the SMTP credentials.">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
        </div>

        {message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <Button onClick={() => void sendTest()} disabled={busy || !email.trim()}>
          {busy ? <Spinner className="border-white/40 border-t-white" /> : (
            <>
              <Send size={16} /> Send test email
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
