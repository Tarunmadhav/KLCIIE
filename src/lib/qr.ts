import QRCode from 'qrcode'

// Ticket QR payloads. The ticket QR is for verification only — scanning it at
// the venue shows registration details but never marks attendance. Attendance
// is marked by scanning the per-round member/attendance QR codes instead.
export interface ParticipantPayload {
  type: 'ticket'
  v: 1
  event_id: string
  registration_id: string
  code: string
}

export interface MemberPayload {
  type: 'member'
  v: 1
  member_id: string
  code: string
}

export function participantPayload(data: ParticipantPayload): string {
  return JSON.stringify(data)
}

export function memberPayload(data: MemberPayload): string {
  return JSON.stringify(data)
}

/**
 * Plain QR data URL (no logo) — used for the ticket so it always scans.
 */
export async function qrDataUrl(text: string, size = 320): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: size,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

/**
 * QR with centered CIIE logo.
 * Uses error-correction level H and keeps the logo <= 22% of the canvas so
 * the QR stays readable. The logo is drawn on a white rounded backing.
 */
export async function qrWithLogoDataUrl(text: string, logoUrl?: string | null, size = 720): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas not supported'))
      return
    }

    QRCode.toCanvas(canvas, text, { errorCorrectionLevel: 'H', margin: 2, width: size })
      .then(async () => {
        if (logoUrl) {
          try {
            const img = await loadImage(logoUrl)
            const logoSize = Math.round(size * 0.2)
            const pad = Math.round(size * 0.015)
            const x = (size - logoSize) / 2
            const y = (size - logoSize) / 2
            ctx.fillStyle = '#ffffff'
            roundRect(ctx, x - pad, y - pad, logoSize + pad * 2, logoSize + pad * 2, Math.round(size * 0.03))
            ctx.fill()
            ctx.drawImage(img, x, y, logoSize, logoSize)
          } catch {
            // Logo failed to load — return the QR without the logo.
          }
        }
        resolve(canvas.toDataURL('image/png'))
      })
      .catch(reject)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = src
  })
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
