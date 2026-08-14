export interface CalendarEventInfo {
  title: string
  startDate: string
  startTime?: string | null
  endDate?: string | null
  endTime?: string | null
  venue?: string | null
  description?: string | null
}

const pad2 = (n: number) => n.toString().padStart(2, '0')

function dateToIso(date: string): string {
  return date.replace(/-/g, '')
}

function timeToIso(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim())
  if (!m) return '000000'
  return `${pad2(Number(m[1]))}${m[2]}00`
}

function plusOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const t = new Date(0, 0, 1, h + 1, m, 0, 0)
  return `${pad2(t.getHours())}:${pad2(t.getMinutes())}`
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate.slice(0, 4)}-${isoDate.slice(4, 6)}-${isoDate.slice(6, 8)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

/** Google Calendar "add event" URL. All-day events use the YYYYMMDD form. */
export function googleCalendarUrl(ev: CalendarEventInfo): string {
  const url = new URL('https://calendar.google.com/calendar/render')
  url.searchParams.set('action', 'TEMPLATE')
  url.searchParams.set('text', ev.title)
  const allDay = !ev.startTime
  if (allDay) {
    url.searchParams.set('dates', `${dateToIso(ev.startDate)}/${dateToIso(ev.endDate ?? ev.startDate)}`)
  } else {
    const startTime = ev.startTime!.trim()
    const endTime = ev.endTime?.trim() || plusOneHour(startTime)
    url.searchParams.set(
      'dates',
      `${dateToIso(ev.startDate)}T${timeToIso(startTime)}/${dateToIso(ev.endDate ?? ev.startDate)}T${timeToIso(endTime)}`,
    )
    url.searchParams.set('ctz', 'Asia/Kolkata')
  }
  if (ev.venue) url.searchParams.set('location', ev.venue)
  if (ev.description) url.searchParams.set('details', ev.description)
  return url.toString()
}

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n')
}

export function icsContent(ev: CalendarEventInfo): string {
  const allDay = !ev.startTime
  const startIso = allDay ? dateToIso(ev.startDate) : `${dateToIso(ev.startDate)}T${timeToIso(ev.startTime!)}`
  const endInclusive = dateToIso(ev.endDate ?? ev.startDate)
  const endIso = allDay
    ? addDays(endInclusive, 1)
    : `${endInclusive}T${timeToIso((ev.endTime?.trim() || plusOneHour(ev.startTime!)).trim())}`
  const now = new Date()
  const stamp = `${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`
  const uid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `event-${Date.now().toString(36)}`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KL CIIE//KL CIIE Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}@klciie.in`,
    `DTSTAMP:${stamp}`,
    allDay ? `DTSTART;VALUE=DATE:${startIso}` : `DTSTART:${startIso}`,
    allDay ? `DTEND;VALUE=DATE:${endIso}` : `DTEND:${endIso}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    ev.venue ? `LOCATION:${icsEscape(ev.venue)}` : '',
    ev.description ? `DESCRIPTION:${icsEscape(ev.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)
  return lines.join('\r\n')
}

export function downloadIcs(ev: CalendarEventInfo, filename = 'event.ics'): void {
  const blob = new Blob([icsContent(ev)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}
