import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RecruitApplicationRow } from '@/lib/types'

/**
 * Live recruitment pipeline rows (RLS-protected RPC + realtime refresh).
 * Refetches whenever an application or evaluation changes so the GD /
 * Interview / Final Selection pages update as CIIE members work.
 */
export function useRecruitLive() {
  const [rows, setRows] = useState<RecruitApplicationRow[] | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('get_recruit_applications')
    if (err) {
      setError(err.message)
      return
    }
    setRows((data as RecruitApplicationRow[] | null) ?? [])
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { rows, error, refresh }
}
