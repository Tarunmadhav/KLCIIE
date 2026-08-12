import { useEffect, useState, type FormEvent } from 'react'
import { Check, Palette, Save, Upload } from 'lucide-react'
import { Button, Field, PageHeader, PageLoader, TextInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { BrandingSettings } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

type LogoKey = 'ciie_logo_url' | 'dark_logo_url' | 'light_logo_url' | 'favicon_url' | 'certificate_logo_url' | 'qr_attendance_logo_url'

const LOGO_FIELDS: Array<{ key: LogoKey; label: string; hint: string }> = [
  { key: 'ciie_logo_url', label: 'Main CIIE logo', hint: 'Used across the site.' },
  { key: 'dark_logo_url', label: 'Dark-mode logo', hint: 'For dark backgrounds.' },
  { key: 'light_logo_url', label: 'Light-mode logo', hint: 'For light backgrounds.' },
  { key: 'favicon_url', label: 'Favicon', hint: 'Small icon (square PNG/SVG).' },
  { key: 'certificate_logo_url', label: 'Certificate logo', hint: 'Printed on certificates.' },
  { key: 'qr_attendance_logo_url', label: 'QR attendance logo', hint: 'Embedded in participant QR codes.' },
]

export default function Branding() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<BrandingSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<LogoKey | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const { data } = await supabase.from('branding_settings').select('*').eq('id', 1).maybeSingle()
    setSettings((data ?? null) as BrandingSettings | null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const upload = async (key: LogoKey, file: File) => {
    setUploading(key)
    setError('')
    const path = `logos/${String(key)}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const { error: upErr } = await supabase.storage.from('branding').upload(path, file, { upsert: true })
    if (upErr) {
      setError(errorMessage(upErr))
      setUploading(null)
      return
    }
    const { data: pub } = supabase.storage.from('branding').getPublicUrl(path)
    setSettings({ ...(settings as BrandingSettings), [key]: pub.publicUrl })
    setUploading(null)
  }

  const removeLogo = async (key: LogoKey) => {
    setSettings({ ...(settings as BrandingSettings), [key]: null })
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!settings) return
    setBusy(true)
    setError('')
    const { error } = await supabase
      .from('branding_settings')
      .update({
        ciie_logo_url: settings.ciie_logo_url,
        dark_logo_url: settings.dark_logo_url,
        light_logo_url: settings.light_logo_url,
        favicon_url: settings.favicon_url,
        certificate_logo_url: settings.certificate_logo_url,
        qr_attendance_logo_url: settings.qr_attendance_logo_url,
        primary_color: settings.primary_color,
        institution_name: settings.institution_name,
        ciie_name: settings.ciie_name,
        updated_by: user?.id ?? null,
      })
      .eq('id', 1)
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
    await supabase.rpc('log_admin_event', { p_action: 'Branding Updated', p_entity_type: 'branding', p_entity_id: '1' })
  }

  if (loading) return <PageLoader />
  if (!settings) return <p className="text-sm text-slate-500">Branding settings not found.</p>

  return (
    <div className="max-w-3xl">
      <PageHeader title="Branding" subtitle="Logos, colours and institution names. Changes apply instantly across the site." />

      <form onSubmit={save} className="space-y-6">
        <section className="card space-y-4 p-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Palette size={16} className="text-primary-600" /> Identity
          </h2>
          <Field label="Institution name">
            <TextInput value={settings.institution_name} onChange={(e) => setSettings({ ...settings, institution_name: e.target.value })} />
          </Field>
          <Field label="CIIE name">
            <TextInput value={settings.ciie_name} onChange={(e) => setSettings({ ...settings, ciie_name: e.target.value })} />
          </Field>
          <Field label="Primary colour" hint="Used for buttons and accents.">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.primary_color}
                onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
                className="h-10 w-16 cursor-pointer rounded-lg border border-slate-300"
              />
              <TextInput value={settings.primary_color} onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })} className="!w-28" />
            </div>
          </Field>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">Logos</h2>
          {LOGO_FIELDS.map(({ key, label, hint }) => (
            <div key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                <p className="text-xs text-slate-400">{hint}</p>
              </div>
              <div className="flex items-center gap-2">
                {settings[key] ? (
                  <>
                    {key === 'favicon_url' || key === 'certificate_logo_url' || key === 'qr_attendance_logo_url' ? (
                      <img src={settings[key]!} alt={label} className="h-10 w-10 rounded-lg border border-slate-200 bg-white object-contain p-1" />
                    ) : (
                      <img src={settings[key]!} alt={label} className="h-8 rounded-lg object-contain" />
                    )}
                    <button type="button" className="text-xs font-medium text-red-500 hover:underline" onClick={() => removeLogo(key)}>
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-slate-300">Not set</span>
                )}
                <label className="btn-secondary cursor-pointer !px-3 !py-1.5 text-sm">
                  <Upload size={14} /> {uploading === key ? 'Uploading…' : 'Upload'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(key, e.target.files[0])} />
                </label>
              </div>
            </div>
          ))}
        </section>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" disabled={busy}>
          {saved ? <Check size={16} className="text-white" /> : <Save size={16} />} {saved ? 'Saved' : 'Save branding'}
        </Button>
      </form>
    </div>
  )
}
