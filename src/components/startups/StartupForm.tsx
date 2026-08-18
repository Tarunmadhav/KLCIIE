import { useState } from 'react'
import { ImageUp } from 'lucide-react'
import { Avatar, Button, Field, TextArea, TextInput } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { Startup } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

const emptyForm = {
  name: '',
  website_url: '',
  contact_email: '',
  location: '',
  twitter: '',
  linkedin: '',
  instagram: '',
  facebook: '',
  description: '',
}

function toForm(s: Startup | null) {
  if (!s) return emptyForm
  const sl = s.social_links ?? {}
  return {
    name: s.name ?? '',
    website_url: s.website_url ?? '',
    contact_email: s.contact_email ?? '',
    location: s.location ?? '',
    twitter: sl.twitter ?? '',
    linkedin: sl.linkedin ?? '',
    instagram: sl.instagram ?? '',
    facebook: sl.facebook ?? '',
    description: sl.description ?? '',
  }
}

interface StartupFormProps {
  initial?: Startup | null
  onSaved: () => void | Promise<void>
  submitLabel?: string
}

export default function StartupForm({ initial, onSaved, submitLabel = 'Add startup' }: StartupFormProps) {
  const [form, setForm] = useState(toForm(initial ?? null))
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? '')
  const [bannerUrl, setBannerUrl] = useState(initial?.banner_url ?? '')
  const [displayOrder, setDisplayOrder] = useState(initial?.display_order ?? 0)
  const [busy, setBusy] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof typeof emptyForm, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const uploadImage = async (file: File, type: 'logo' | 'banner') => {
    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingBanner
    const setUrl = type === 'logo' ? setLogoUrl : setBannerUrl
    setUploading(true)
    setError('')
    const path = `startups-${type}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const { error: upErr } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    setUploading(false)
    if (upErr) {
      setError(errorMessage(upErr))
      return
    }
    const { data: pub } = supabase.storage.from('media').getPublicUrl(path)
    setUrl(pub.publicUrl)
  }

  const submit = async () => {
    setBusy(true)
    setError('')
    const social_links: Record<string, string> = {}
    if (form.twitter.trim()) social_links.twitter = form.twitter.trim()
    if (form.linkedin.trim()) social_links.linkedin = form.linkedin.trim()
    if (form.instagram.trim()) social_links.instagram = form.instagram.trim()
    if (form.facebook.trim()) social_links.facebook = form.facebook.trim()
    if (form.description.trim()) social_links.description = form.description.trim()

    const params = {
      p_name: form.name.trim(),
      p_website_url: form.website_url.trim() || null,
      p_logo_url: logoUrl.trim() || null,
      p_banner_url: bannerUrl.trim() || null,
      p_contact_email: form.contact_email.trim() || null,
      p_location: form.location.trim() || null,
      p_social_links: social_links,
      p_display_order: displayOrder,
    }
    const { data, error: rpcError } = initial
      ? await supabase.rpc('admin_update_startup', { p_id: initial.id, ...params })
      : await supabase.rpc('admin_add_startup', params)
    setBusy(false)
    if (rpcError) {
      setError(errorMessage(rpcError))
      return
    }
    const res = (data ?? {}) as { ok?: boolean; error?: string }
    if (res.error) {
      setError(res.error)
      return
    }
    setForm(emptyForm)
    setLogoUrl('')
    setBannerUrl('')
    setDisplayOrder(0)
    await onSaved()
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3">
          <Avatar name={form.name || 'Startup'} src={logoUrl || null} className="h-14 w-14 text-lg" />
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
              <ImageUp size={15} /> {uploadingLogo ? 'Uploading…' : 'Upload logo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadImage(e.target.files![0], 'logo')} />
            </label>
            <p className="mt-1 text-xs text-slate-400">Recommended 512×512 (1:1 square).</p>
          </div>
        </div>
        <div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
            <ImageUp size={15} /> {uploadingBanner ? 'Uploading…' : 'Upload banner'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadImage(e.target.files![0], 'banner')} />
          </label>
          <p className="mt-1 text-xs text-slate-400">Recommended 1920×600 (3.2:1 ratio). JPG or PNG.</p>
          {bannerUrl && <p className="mt-1 text-xs text-green-600">Banner uploaded</p>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Startup name *">
          <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. InnovateX" required />
        </Field>
        <Field label="Website URL">
          <TextInput value={form.website_url} onChange={(e) => set('website_url', e.target.value)} placeholder="https://example.com" />
        </Field>
        <Field label="Contact email">
          <TextInput value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} placeholder="hello@startup.com" />
        </Field>
        <Field label="Location">
          <TextInput value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Hyderabad, India" />
        </Field>
        <Field label="Display order">
          <TextInput inputMode="numeric" value={displayOrder} onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)} placeholder="0" />
        </Field>
      </div>

      <Field label="About / Description">
        <TextArea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Brief description of the startup…" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Twitter / X">
          <TextInput value={form.twitter} onChange={(e) => set('twitter', e.target.value)} placeholder="https://x.com/…" />
        </Field>
        <Field label="LinkedIn">
          <TextInput value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} placeholder="https://linkedin.com/company/…" />
        </Field>
        <Field label="Instagram">
          <TextInput value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="https://instagram.com/…" />
        </Field>
        <Field label="Facebook">
          <TextInput value={form.facebook} onChange={(e) => set('facebook', e.target.value)} placeholder="https://facebook.com/…" />
        </Field>
      </div>

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={busy || uploadingLogo || uploadingBanner}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
