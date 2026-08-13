import type { CustomFieldDef } from '@/lib/types'
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui'
import PhoneInput from '@/components/PhoneInput'

export function CustomFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: CustomFieldDef[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}) {
  const set = (key: string, value: string) => onChange({ ...values, [key]: value })

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f.key} className={f.key === 'phone' || f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
          <Field label={`${f.label} *`}>
            {f.key === 'phone' ? (
              <PhoneInput value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
            ) : f.type === 'textarea' ? (
              <TextArea
                required
                rows={3}
                value={values[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.label}
              />
            ) : f.type === 'select' ? (
              <SelectInput required value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </SelectInput>
            ) : (
              <TextInput
                required
                type={f.type === 'number' ? 'number' : 'text'}
                value={values[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.label}
              />
            )}
          </Field>
        </div>
      ))}
    </div>
  )
}

export function missingFields(fields: CustomFieldDef[], values: Record<string, string>): string | null {
  for (const f of fields) {
    if (f.required && !(values[f.key] ?? '').trim()) {
      return `"${f.label}" is required.`
    }
  }
  return null
}
