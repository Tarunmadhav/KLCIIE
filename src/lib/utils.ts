export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function formatDate(value: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-IN', opts ?? { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function isUpcoming(event: { start_date: string; status?: string }): boolean {
  return (event.status ?? 'published') !== 'completed' && new Date(event.start_date) >= startOfToday()
}

export function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function seatsRemaining(event: { seats: number; registrations?: number }): number {
  const used = event.registrations ?? 0
  return Math.max(0, event.seats - used)
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

export function moneyPoints(points: number): string {
  return points > 0 ? `+${points}` : `${points}`
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err ?? 'Something went wrong')
}

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

export interface EmbedInfo {
  kind: 'youtube' | 'vimeo' | 'direct'
  embedSrc: string
  thumbUrl?: string
}

export function getEmbedInfo(url: string | null | undefined): EmbedInfo | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  try {
    const u = new URL(trimmed)

    if (/(youtube\.com|youtu\.be)/i.test(u.hostname)) {
      let id = ''
      if (u.hostname.toLowerCase().includes('youtu.be')) {
        id = u.pathname.split('/').filter(Boolean)[0] ?? ''
      } else if (u.pathname === '/watch') {
        id = u.searchParams.get('v') ?? ''
      } else {
        const parts = u.pathname.split('/').filter(Boolean)
        id = parts[1] ?? ''
      }
      if (id) {
        return {
          kind: 'youtube',
          embedSrc: `https://www.youtube.com/embed/${id}`,
          thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        }
      }
    }

    if (/vimeo\.com/i.test(u.hostname)) {
      const id = u.pathname.split('/').filter(Boolean)[0] ?? ''
      if (/^\d+$/.test(id)) {
        return { kind: 'vimeo', embedSrc: `https://player.vimeo.com/video/${id}` }
      }
    }

    if (/\.(mp4|webm|ogv|ogg|mov|m4v)(\?.*)?$/i.test(u.pathname)) {
      return { kind: 'direct', embedSrc: trimmed }
    }
  } catch {
    return null
  }
  return null
}

export function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url.trim())
    return /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?.*)?$/i.test(u.pathname)
  } catch {
    return false
  }
}

export function isStorageUpload(url: string | null | undefined): boolean {
  if (!url) return false
  return /\/storage\/v1\/object\/public\/media\//i.test(url)
}
