/**
 * Recovery codes are NOT provided by Supabase Auth natively, so we generate
 * high-entropy codes here and store only their SHA-256 hashes server-side
 * (see public.generate_recovery_codes). Codes are single-use.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randInt(max: number): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % max
}

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    let raw = ''
    for (let j = 0; j < 8; j++) raw += ALPHABET[randInt(ALPHABET.length)]
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`)
  }
  return codes
}

export function recoveryCodesText(codes: string[]): string {
  return [
    'KL CIIE — Admin Recovery Codes',
    '================================',
    '',
    'Keep these somewhere safe. Each code can be used ONCE.',
    'They are only shown here.',
    '',
    ...codes,
    '',
    'If you run out, a Super Admin can force an MFA reset.',
  ].join('\n')
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
