import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { PlatformSettings } from '@/lib/types'

const DEFAULT_SETTINGS: PlatformSettings = {
  id: 1,
  allow_public_signup: true,
  signup_domain_restriction: true,
  signup_allowed_domains: ['kluniversity.in'],
  interview_day_1: null,
  interview_day_2: null,
  facebook_url: null,
  instagram_url: null,
  linkedin_url: null,
  twitter_url: null,
  youtube_url: null,
  contact_email: null,
  contact_phone: null,
  office_address: null,
  signup_fields: [],
  amtps_mode: true,
  updated_by: null,
}

const SettingsContext = createContext<PlatformSettings>(DEFAULT_SETTINGS)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data } = await supabase.from('platform_settings').select('*').eq('id', 1).maybeSingle()
      if (active && data) {
        setSettings(data as PlatformSettings)
      }
    }
    load()
    const channel = supabase
      .channel('platform-settings-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'platform_settings', filter: 'id=eq.1' },
        () => load(),
      )
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
}

export function useSettings(): PlatformSettings {
  return useContext(SettingsContext)
}

/** Assigned GD/Interview date for a given batch, or null when not set yet. */
export function interviewDateFor(settings: PlatformSettings, batch: 1 | 2 | null | undefined): string | null {
  if (!batch) return null
  return batch === 1 ? settings.interview_day_1 : settings.interview_day_2
}
