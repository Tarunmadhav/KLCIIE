import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Save } from 'lucide-react'
import { Badge, Button, Field, SelectInput, TextArea, TextInput, Toggle } from '@/components/ui'
import { FieldListEditor } from '@/components/FieldListEditor'
import { supabase } from '@/lib/supabase'
import type { CustomFieldDef, FacultyFormStatus } from '@/lib/types'
import { errorMessage, slugify } from '@/lib/utils'

export default function FacultyFormEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = !!id
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<FacultyFormStatus>('published')
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [fields, setFields] = useState<CustomFieldDef[]>([])

  useEffect(() => {
    if (!id) return
    let active = true
    supabase
      .from('faculty_forms')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        if (data) {
          setTitle(data.title)
          setDescription(data.description ?? '')
          setStatus(data.status as FacultyFormStatus)
          setAllowMultiple(!!data.allow_multiple)
          setFields((data.fields ?? []) as CustomFieldDef[])
        }
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    if (!title.trim()) {
      setError('Please enter a form title.')
      setBusy(false)
      return
    }
    const cleanFields = fields
      .filter((f) => f.label.trim())
      .map((f) => ({
        key: f.key || slugify(f.label) + '_' + Math.random().toString(36).slice(2, 6),
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        options: f.type === 'select' ? (f.options ?? []).filter(Boolean) : undefined,
      }))
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      allow_multiple: allowMultiple,
      fields: cleanFields,
    }
    let err: unknown
    if (isEdit) {
      const { error: upErr } = await supabase.from('faculty_forms').update(payload).eq('id', id!)
      err = upErr
    } else {
      const { error: insErr } = await supabase.from('faculty_forms').insert(payload)
      err = insErr
    }
    setBusy(false)
    if (err) {
      setError(errorMessage(err))
      return
    }
    navigate('/admin/faculty-forms')
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>

  return (
    <div className="max-w-3xl">
      <Link to="/admin/faculty-forms" className="text-sm font-medium text-primary-600 hover:underline">
        ← Forms for Faculty
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{isEdit ? 'Edit faculty form' : 'New faculty form'}</h1>
      <p className="mt-1 text-sm text-slate-500">
        Published forms appear in every faculty member's panel. Their submissions show under Faculty Forms Submitted.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <section className="card space-y-4 p-6">
          <Field label="Form title">
            <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Faculty Feedback — Sem 1" />
          </Field>
          <Field label="Description" hint="Shown to faculty above the questions.">
            <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="max-w-xs">
            <Field label="Status">
              <SelectInput value={status} onChange={(e) => setStatus(e.target.value as FacultyFormStatus)}>
                <option value="draft">Draft — hidden from faculty</option>
                <option value="published">Published — faculty can fill it</option>
                <option value="closed">Closed — read-only for faculty</option>
              </SelectInput>
            </Field>
          </div>
          {status === 'published' && <Badge tone="green">Live — visible in the faculty panel.</Badge>}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Allow multiple submissions</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Faculty can submit this form any number of times — every submission is saved as a separate record with its own timestamp.
              </p>
            </div>
            <Toggle checked={allowMultiple} onChange={setAllowMultiple} />
          </div>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-slate-900">Questions</h2>
          <FieldListEditor fields={fields} onChange={setFields} hint="Select-type options are comma separated." />
        </section>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>
            <Save size={16} /> {isEdit ? 'Save changes' : 'Create form'}
          </Button>
          <Link to="/admin/faculty-forms" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
