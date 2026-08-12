import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { BrandingSettings } from '@/lib/types'

const DEFAULT_BRANDING: BrandingSettings = {
  id: 1,
  ciie_logo_url: null,
  dark_logo_url: null,
  light_logo_url: null,
  favicon_url: null,
  certificate_logo_url: null,
  qr_attendance_logo_url: null,
  primary_color: '#7c3aed',
  institution_name: 'Koneru Lakshmaiah Education Foundation',
  ciie_name: 'CIIE — Centre for Innovation, Incubation & Entrepreneurship',
  updated_by: null,
}

const BrandingContext = createContext<BrandingSettings>(DEFAULT_BRANDING)

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING)

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data, error } = await supabase
        .from('branding_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
      if (active && !error && data) {
        setBranding(data as BrandingSettings)
      }
    }
    load()
    const channel = supabase
      .channel('branding-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'branding_settings', filter: 'id=eq.1' },
        () => load(),
      )
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
}

export function useBranding(): BrandingSettings {
  return useContext(BrandingContext)
}
