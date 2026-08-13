import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface EmailSendStatus {
  locked: boolean
  locked_until: string | null
  wait_seconds: number
  attempts: number
}

export function formatWait(seconds: number): string {
  if (seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

export function useEmailCooldown(email: string | null) {
  const [status, setStatus] = useState<EmailSendStatus | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(false)
  const emailRef = useRef(email)

  useEffect(() => {
    emailRef.current = email
  }, [email])

  const refresh = useCallback(async (assumeWaitSeconds = 0) => {
    const current = emailRef.current
    if (!current) return
    if (assumeWaitSeconds > 0) setRemaining(assumeWaitSeconds)
    setLoading(true)
    const { data } = await supabase.rpc('email_send_status', { p_email: current })
    const s = (data ?? null) as EmailSendStatus | null
    setStatus(s)
    setRemaining(Math.max(assumeWaitSeconds, s?.wait_seconds ?? 0))
    setLoading(false)
  }, [])

  useEffect(() => {
    if (email) void refresh()
  }, [email, refresh])

  useEffect(() => {
    if (remaining <= 0) return
    const t = setInterval(() => setRemaining((prev) => Math.max(0, prev - 1)), 1000)
    return () => clearInterval(t)
  }, [remaining > 0])

  useEffect(() => {
    if (remaining === 0 && (status?.wait_seconds ?? 0) > 0) {
      void refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, status?.wait_seconds])

  return { status, remaining, loading, refresh }
}
