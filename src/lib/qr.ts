import QRCode from 'qrcode'

// QRs encode opaque codes only (attendance codes / REG- ticket codes). Personal
// data is never embedded in the QR content, so an external scanner (phone
// camera, USB scanner, etc.) shows no attendee details — registration details
// are only fetched and displayed by the CIIE website scanner.
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
