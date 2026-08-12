import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CustomFieldDef } from '@/lib/types'
import { TextInput, SelectInput } from '@/components/ui'

const TYPES: CustomFieldDef['type'][] = ['text', 'number', 'select', 'textarea']

const splitOptions = (raw: string): string[] =>
  raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

export function FieldListEditor({
  fields,
  onChange,
  hint,
}: {
  fields: CustomFieldDef[]
  onChange: (fields: CustomFieldDef[]) => void
  hint?: string
}) {
  const [focused, setFocused] = useState<number | null>(null)
  const [rawOptions, setRawOptions] = useState<string[]>(() => fields.map((f) => (f.options ?? []).join(', ')))

  useEffect(() => {
    setRawOptions((prev) =>
      fields.map((f, i) => (focused === i ? prev[i] ?? '' : (f.options ?? []).join(', '))),
    )
  }, [fields, focused])

  const update = (i: number, patch: Partial<CustomFieldDef>) => {
    const next = fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f))
    onChange(next)
  }

  const updateOptions = (i: number, raw: string) => {
    setRawOptions((prev) => {
      const next = [...prev]
      next[i] = raw
      return next
    })
    update(i, { options: splitOptions(raw) })
  }

  const remove = (i: number) => {
    setRawOptions((prev) => prev.filter((_, idx) => idx !== i))
    onChange(fields.filter((_, idx) => idx !== i))
  }

  const add = () => {
    setRawOptions((prev) => [...prev, ''])
    onChange([
      ...fields,
      { key: '', label: '', type: 'text', required: true, options: [] },
    ])
  }

  return (
    <div className="space-y-3">
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
          No extra fields configured. You can add custom questions below.
        </p>
      ) : (
        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Field key</span>
                  <TextInput
                    value={f.key}
                    placeholder="e.g. roll_number"
                    onChange={(e) => update(i, { key: e.target.value.trim() })}
                  />
                </label>
                <label className="block">
                  <span className="label">Field label</span>
                  <TextInput
                    value={f.label}
                    placeholder="e.g. Roll number"
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="label">Type</span>
                  <SelectInput value={f.type} onChange={(e) => update(i, { type: e.target.value as CustomFieldDef['type'] })}>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </SelectInput>
                </label>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => update(i, { required: !f.required })}
                    className={`btn-secondary !px-3 !py-2 text-xs ${f.required ? '!border-primary-400 !text-primary-700' : ''}`}
                  >
                    {f.required ? 'Mandatory' : 'Optional'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="btn-danger !px-3 !py-2 text-xs"
                    aria-label="Remove field"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {f.type === 'select' && (
                  <label className="block sm:col-span-2">
                    <span className="label">Options (comma separated)</span>
                    <TextInput
                      value={rawOptions[i] ?? ''}
                      placeholder="Option 1, Option 2, Option 3"
                      onFocus={() => setFocused(i)}
                      onBlur={() => setFocused(null)}
                      onChange={(e) => updateOptions(i, e.target.value)}
                    />
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn-secondary text-xs" onClick={add}>
        <Plus size={14} /> Add field
      </button>
    </div>
  )
}
