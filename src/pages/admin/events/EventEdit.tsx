import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Save, Trash2, Upload } from 'lucide-react'
import { Badge, Button, Field, SelectInput, TextArea, TextInput, Toggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { errorMessage, slugify } from '@/lib/utils'

interface FormField {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'textarea'
  required: boolean
  options?: string[]
  optionsRaw?: string
}

const EMPTY_FIELD: FormField = { key: '', label: '', type: 'text', required: false, options: [], optionsRaw: '' }

const splitOptions = (raw: string): string[] =>
  raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

const toLocalInputValue = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function EventEdit() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit = !!id
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({
    title: '',
    slug: '',
    category: 'Workshop',
    description: '',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    venue: '',
    mode: 'offline' as 'offline' | 'online' | 'hybrid',
    registration_deadline: '',
    seats: '100',
    attendance_rounds: '1',
    status: 'draft' as 'draft' | 'published' | 'completed' | 'cancelled',
    registration_enabled: true,
    show_team_public: true,
    coordinator_note: '',
  })
  const [fields, setFields] = useState<FormField[]>([EMPTY_FIELD])

  useEffect(() => {
    if (!id) return
    let active = true
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return
        const e = data as Record<string, unknown>
        const rounds = Number(e.attendance_rounds)
        setForm({
          title: String(e.title ?? ''),
          slug: String(e.slug ?? ''),
          category: String(e.category ?? 'Workshop'),
          description: String(e.description ?? ''),
          start_date: String(e.start_date ?? '').slice(0, 10),
          start_time: String(e.start_time ?? ''),
          end_date: String(e.end_date ?? '').slice(0, 10),
          end_time: String(e.end_time ?? ''),
          venue: String(e.venue ?? ''),
          mode: (e.mode as 'offline' | 'online' | 'hybrid') ?? 'offline',
          registration_deadline: e.registration_deadline ? toLocalInputValue(String(e.registration_deadline)) : '',
          seats: String(e.seats ?? '100'),
          attendance_rounds: Number.isFinite(rounds) && rounds >= 1 ? String(rounds) : '1',
          status: (e.status as 'draft' | 'published' | 'completed' | 'cancelled') ?? 'draft',
          registration_enabled: Boolean(e.registration_enabled),
          show_team_public: Boolean(e.show_team_public),
          coordinator_note: String(e.coordinator_note ?? ''),
        })
        setFields((e.form_fields as FormField[])?.length ? (e.form_fields as FormField[]).map((f) => ({ ...f, optionsRaw: (f.options ?? []).join(', ') })) : [EMPTY_FIELD])
        setBannerUrl(String(e.banner_url ?? '') || null)
      })
    return () => {
      active = false
    }
  }, [id])

  const uploadBanner = async (file: File) => {
    setUploading(true)
    const path = `events/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const { error: upErr } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    if (upErr) {
      setError(errorMessage(upErr))
      setUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from('media').getPublicUrl(path)
    setBannerUrl(pub.publicUrl)
    setUploading(false)
  }

  const setField = (i: number, patch: Partial<FormField>) => {
    const next = fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f))
    setFields(next)
  }

  const addField = () => setFields([...fields, { ...EMPTY_FIELD, key: `field_${Date.now()}`, optionsRaw: '' }])
  const removeField = (i: number) => setFields(fields.filter((_, idx) => idx !== i))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')

    const cleanFields = fields.filter((f) => f.label.trim())
    if (cleanFields.some((f) => f.type === 'select' && splitOptions(f.optionsRaw ?? '').length === 0)) {
      setError('Select-type questions need at least one option.')
      setBusy(false)
      return
    }

    const payload = {
      title: form.title,
      slug: form.slug || slugify(form.title) + (isEdit ? '' : '-' + Date.now().toString(36)),
      category: form.category,
      description: form.description || null,
      banner_url: bannerUrl,
      start_date: form.start_date,
      start_time: form.start_time || null,
      end_date: form.end_date || null,
      end_time: form.end_time || null,
      venue: form.venue || null,
      mode: form.mode,
      registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
      seats: Number(form.seats) || 100,
      attendance_rounds: Math.max(1, Math.min(30, Number(form.attendance_rounds) || 1)),
      status: form.status,
      registration_enabled: form.registration_enabled,
      show_team_public: form.show_team_public,
      coordinator_note: form.coordinator_note || null,
      form_fields: cleanFields.map((f) => ({
        key: f.key || slugify(f.label) + '_' + Math.random().toString(36).slice(2, 6),
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        options: f.type === 'select' ? splitOptions(f.optionsRaw ?? '') : undefined,
      })),
    }

    let err: unknown
    let newId = id
    if (isEdit) {
      const { error } = await supabase.from('events').update(payload).eq('id', id!)
      err = error
    } else {
      const { data, error } = await supabase.from('events').insert(payload).select('id').single()
      err = error
      newId = data?.id
    }

    setBusy(false)
    if (err) {
      setError(errorMessage(err))
      return
    }
    await supabase.rpc('log_admin_event', {
      p_action: isEdit ? 'Event Updated' : 'Event Created',
      p_entity_type: 'event',
      p_entity_id: newId,
    })
    navigate(isEdit ? `/admin/events/${newId}` : `/admin/events/${newId}`)
  }

  return (
    <div className="max-w-4xl">
      <Link to="/admin/events" className="text-sm font-medium text-primary-600 hover:underline">
        ← All events
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{isEdit ? 'Edit Event' : 'Create Event'}</h1>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Event title">
                <TextInput required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
            </div>
            <Field label="Category">
              <TextInput value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Workshop / Hackathon / Summit…" />
            </Field>
            <Field label="Mode">
              <SelectInput value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as typeof form.mode })}>
                <option value="offline">Offline</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
              </SelectInput>
            </Field>
            <Field label="Venue">
              <TextInput value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="CIIE Innovation Hub" />
            </Field>
            <Field label="Start date">
              <TextInput type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="Start time">
              <TextInput type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </Field>
            <Field label="End date">
              <TextInput type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
            <Field label="End time">
              <TextInput type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </Field>
            <Field label="Registration deadline">
              <TextInput type="datetime-local" value={form.registration_deadline} onChange={(e) => setForm({ ...form, registration_deadline: e.target.value })} />
            </Field>
            <Field label="Seats">
              <TextInput type="number" min={1} value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
            </Field>
            <Field label="Attendance rounds" hint="Number of scan-in rounds. Members get one QR per round; final attendance = present in all rounds.">
              <TextInput type="number" min={1} max={30} value={form.attendance_rounds} onChange={(e) => setForm({ ...form, attendance_rounds: e.target.value })} />
            </Field>
          </div>
          <Field label="Description">
            <TextArea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Coordinator note" hint="Shown prominently on the public event page.">
            <TextInput value={form.coordinator_note} onChange={(e) => setForm({ ...form, coordinator_note: e.target.value })} />
          </Field>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">Banner</h2>
          <div className="flex items-center gap-4">
            {bannerUrl ? (
              <img src={bannerUrl} alt="Banner preview" className="h-24 w-40 rounded-lg object-cover" />
            ) : (
              <div className="flex h-24 w-40 items-center justify-center rounded-lg bg-slate-100 text-slate-400">No banner</div>
            )}
            <label className="btn-secondary cursor-pointer">
              <Upload size={15} /> {uploading ? 'Uploading…' : 'Upload banner'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} />
            </label>
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Registration form</h2>
            <Button type="button" variant="secondary" onClick={addField}>
              <Plus size={15} /> Add question
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Custom questions render dynamically on the public registration form. Answers are stored in form_data.
          </p>
          {fields.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem_5rem]">
                <Field label="Question label">
                  <TextInput value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="e.g. Team name" />
                </Field>
                <Field label="Type">
                  <SelectInput value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormField['type'] })}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="select">Select</option>
                    <option value="textarea">Paragraph</option>
                  </SelectInput>
                </Field>
                <div className="flex items-end gap-2">
                  <Toggle checked={f.required} onChange={(v) => setField(i, { required: v })} label="Req" />
                  <button type="button" className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => removeField(i)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {f.type === 'select' && (
                <div className="mt-2">
                  <Field label="Options (comma separated)">
                    <TextInput
                      value={f.optionsRaw ?? ''}
                      onChange={(e) => setField(i, { optionsRaw: e.target.value })}
                      placeholder="Option 1, Option 2, Option 3"
                    />
                  </Field>
                </div>
              )}
            </div>
          ))}
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">Publishing</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <SelectInput value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </SelectInput>
            </Field>
            <div className="flex flex-col justify-end gap-3">
              <Toggle checked={form.registration_enabled} onChange={(v) => setForm({ ...form, registration_enabled: v })} label="Registration enabled" />
              <Toggle checked={form.show_team_public} onChange={(v) => setForm({ ...form, show_team_public: v })} label="Show event team publicly" />
            </div>
          </div>
          {form.status === 'published' && (
            <Badge tone="green">Live — appears in Upcoming Events until its date passes.</Badge>
          )}
          {form.status === 'completed' && (
            <Badge tone="slate">Completed events are automatically hidden from Upcoming Events.</Badge>
          )}
        </section>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>
            <Save size={16} /> {isEdit ? 'Save changes' : 'Create event'}
          </Button>
          <Link to="/admin/events" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
