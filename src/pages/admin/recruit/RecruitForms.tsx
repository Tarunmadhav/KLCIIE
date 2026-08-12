import { useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Badge, Button, Field, PageHeader, SelectInput, Spinner, TextArea, TextInput, Toggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { CustomFieldDef, RecruitFormTemplate } from '@/lib/types'
import { errorMessage, slugify } from '@/lib/utils'

interface FieldDraft extends CustomFieldDef {
  optionsRaw?: string
}

const EMPTY_FIELD: FieldDraft = { key: '', label: '', type: 'text', required: false, options: [], optionsRaw: '' }

const splitOptions = (raw: string): string[] =>
  raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

type Kind = 'gd' | 'interview'

const KIND_META: Record<Kind, { label: string; hint: string }> = {
  gd: {
    label: 'GD form',
    hint: 'Filled by CIIE members in the GD round. Submitting it forwards the applicant to the Interview round.',
  },
  interview: {
    label: 'Interview form',
    hint: 'Filled by CIIE members in the Interview round. Submitting it forwards the applicant to Final Selection.',
  },
}

export default function RecruitForms() {
  const [tab, setTab] = useState<Kind>('gd')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState<FieldDraft[]>([EMPTY_FIELD])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const load = async (kind: Kind) => {
    const { data } = await supabase
      .from('recruit_form_templates')
      .select('*')
      .eq('kind', kind)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const t = (data as RecruitFormTemplate | null) ?? null
    setTitle(t?.title ?? '')
    setDescription(t?.description ?? '')
    setFields(t?.fields?.length ? t.fields.map((f) => ({ ...f, optionsRaw: (f.options ?? []).join(', ') })) : [EMPTY_FIELD])
    setLastUpdated(t?.updated_at ?? null)
    setError('')
    setSaved('')
  }

  useEffect(() => {
    void load(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const setField = (i: number, patch: Partial<FieldDraft>) => {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  const addField = () => setFields((prev) => [...prev, { ...EMPTY_FIELD, key: `field_${Date.now()}`, optionsRaw: '' }])
  const removeField = (i: number) => setFields((prev) => prev.filter((_, idx) => idx !== i))

  const submit = async () => {
    setBusy(true)
    setError('')
    setSaved('')

    const cleanFields = fields.filter((f) => f.label.trim())
    if (!title.trim()) {
      setError('Give the form a title.')
      setBusy(false)
      return
    }
    if (cleanFields.length === 0) {
      setError('Add at least one question.')
      setBusy(false)
      return
    }
    if (cleanFields.some((f) => f.type === 'select' && splitOptions(f.optionsRaw ?? '').length === 0)) {
      setError('Select-type questions need at least one option.')
      setBusy(false)
      return
    }

    const payload = cleanFields.map((f) => ({
      key: f.key || slugify(f.label) + '_' + Math.random().toString(36).slice(2, 6),
      label: f.label.trim(),
      type: f.type,
      required: f.required,
      options: f.type === 'select' ? splitOptions(f.optionsRaw ?? '') : undefined,
    }))

    const { error: err } = await supabase.rpc('upsert_recruit_form', {
      p_kind: tab,
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_fields: payload,
    })
    setBusy(false)
    if (err) {
      setError(errorMessage(err))
      return
    }
    setSaved(`"${title.trim()}" is now the live ${KIND_META[tab].label}.`)
    await load(tab)
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Recruit Forms"
        subtitle="Define the questions CIIE members answer when they fill the GD and Interview forms for each applicant."
      />

      <div className="mb-6 flex gap-2">
        {(Object.keys(KIND_META) as Kind[]).map((k) => (
          <Button key={k} variant={tab === k ? 'primary' : 'secondary'} className="!px-4 !py-2 text-sm" onClick={() => setTab(k)}>
            {KIND_META[k].label}
          </Button>
        ))}
      </div>

      <div className="card space-y-5 p-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">{KIND_META[tab].label}</h2>
          <p className="text-xs text-slate-500">{KIND_META[tab].hint}</p>
          {lastUpdated && <p className="mt-1 text-[11px] text-slate-400">Last updated {new Date(lastUpdated).toLocaleString('en-IN')}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Form title">
              <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`e.g. ${tab === 'gd' ? 'Group Discussion Evaluation' : 'Personal Interview Evaluation'}`} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description (shown to CIIE members above the questions)">
              <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short instructions for the evaluator…" />
            </Field>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Questions</h3>
            <Button type="button" variant="secondary" onClick={addField}>
              <Plus size={15} /> Add question
            </Button>
          </div>

          <div className="mt-3 space-y-3">
            {fields.map((f, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem_5rem]">
                  <Field label="Question label">
                    <TextInput value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="e.g. Communication skills rating" />
                  </Field>
                  <Field label="Type">
                    <SelectInput value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldDraft['type'] })}>
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
          </div>
        </div>

        {saved && <Badge tone="green">{saved}</Badge>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? <Spinner className="border-white/40 border-t-white" /> : (
            <>
              <Save size={16} /> Publish {KIND_META[tab].label}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
