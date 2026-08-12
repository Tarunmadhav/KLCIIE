const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const BASE = 34n
const DIGITS = 6

/**
 * HMAC-based rotating alphanumeric code (TOTP-style, 60s step).
 * Mirrors `public.registration_otp_at()` in the database so the admin panel can
 * show the same code that the server validates.
 */
export async function rotatingCode(secret: string, stepSeconds = 60, back = 0): Promise<string | null> {
  if (!secret) return null
  try {
    const counter = Math.floor(Date.now() / 1000 / stepSeconds) - back
    const msg = new ArrayBuffer(8)
    const view = new DataView(msg)
    view.setBigUint64(0, BigInt(counter))

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, msg)
    const h = new Uint8Array(sig)
    const offset = h[h.length - 1] & 0x0f
    const bin =
      ((h[offset] & 0x7f) << 24) |
      ((h[offset + 1] & 0xff) << 16) |
      ((h[offset + 2] & 0xff) << 8) |
      (h[offset + 3] & 0xff)

    let value = BigInt(bin) % BASE ** BigInt(DIGITS)
    let out = ''
    for (let i = 0; i < DIGITS; i++) {
      out = ALPHABET[Number(value % BASE)] + out
      value = value / BASE
    }
    return out
  } catch {
    return null
  }
}

export function secondsUntilNextStep(stepSeconds = 60): number {
  return stepSeconds - (Math.floor(Date.now() / 1000) % stepSeconds)
}
