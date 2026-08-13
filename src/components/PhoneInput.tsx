import { SelectInput, TextInput } from '@/components/ui'

export const COUNTRY_CODES: Array<{ code: string; dial: string; label: string }> = [
  { code: 'IN', dial: '+91', label: 'India (+91)' },
  { code: 'US', dial: '+1', label: 'US/Canada (+1)' },
  { code: 'GB', dial: '+44', label: 'UK (+44)' },
  { code: 'AE', dial: '+971', label: 'UAE (+971)' },
  { code: 'SA', dial: '+966', label: 'Saudi Arabia (+966)' },
  { code: 'MY', dial: '+60', label: 'Malaysia (+60)' },
  { code: 'SG', dial: '+65', label: 'Singapore (+65)' },
  { code: 'AU', dial: '+61', label: 'Australia (+61)' },
  { code: 'NG', dial: '+234', label: 'Nigeria (+234)' },
  { code: 'PK', dial: '+92', label: 'Pakistan (+92)' },
  { code: 'BD', dial: '+880', label: 'Bangladesh (+880)' },
  { code: 'LK', dial: '+94', label: 'Sri Lanka (+94)' },
  { code: 'NP', dial: '+977', label: 'Nepal (+977)' },
  { code: 'CN', dial: '+86', label: 'China (+86)' },
  { code: 'JP', dial: '+81', label: 'Japan (+81)' },
  { code: 'KR', dial: '+82', label: 'South Korea (+82)' },
  { code: 'DE', dial: '+49', label: 'Germany (+49)' },
  { code: 'FR', dial: '+33', label: 'France (+33)' },
]

export function parsePhone(value: string | undefined): { dial: string; number: string } {
  const v = (value ?? '').trim()
  if (!v) return { dial: '+91', number: '' }
  const match = v.match(/^(\+\d{1,4})\s*(.*)$/)
  if (match) return { dial: match[1], number: match[2].replace(/[\s()-]/g, '') }
  return { dial: '+91', number: v.replace(/[\s()-]/g, '') }
}

export default function PhoneInput({
  value,
  onChange,
  placeholder = '98765 43210',
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const { dial, number } = parsePhone(value)
  const options = COUNTRY_CODES.some((c) => c.dial === dial)
    ? COUNTRY_CODES
    : [...COUNTRY_CODES, { code: 'XX', dial, label: dial }]

  return (
    <div className="flex gap-2">
      <SelectInput
        value={dial}
        disabled={disabled}
        onChange={(e) => onChange(`${e.target.value} ${number}`)}
        className="!w-36 shrink-0"
        aria-label="Country code"
      >
        {options.map((c) => (
          <option key={c.code} value={c.dial}>
            {c.label}
          </option>
        ))}
      </SelectInput>
      <TextInput
        inputMode="tel"
        disabled={disabled}
        value={number}
        onChange={(e) => onChange(`${dial} ${e.target.value.replace(/\D/g, '').slice(0, 15)}`)}
        placeholder={placeholder}
        className="min-w-0 flex-1"
      />
    </div>
  )
}
