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

function applyFavicon(url: string | null) {
  const href = url || '/logo.png'
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = href

  let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (!apple) {
    apple = document.createElement('link')
    apple.rel = 'apple-touch-icon'
    document.head.appendChild(apple)
  }
  apple.href = href
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING)

  useEffect(() => {
    applyFavicon(branding.favicon_url)
  }, [branding.favicon_url])

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
    return () => {
      active = false
    }
  }, [])

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
}

export function useBranding(): BrandingSettings {
  return useContext(BrandingContext)
}
