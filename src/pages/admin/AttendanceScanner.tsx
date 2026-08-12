import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageLoader } from '@/components/ui'
import AttendanceScannerPanel from '@/components/AttendanceScannerPanel'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/types'
import { formatDate } from '@/lib/utils'

export default function AttendanceScanner() {
  const { eventId } = useParams()
  const [event, setEvent] = useState<Event | null>(null)

  useEffect(() => {
    if (!eventId) return
    let active = true
    supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setEvent((data ?? null) as Event | null)
      })
    return () => {
      active = false
    }
  }, [eventId])

  if (!event || !eventId) return <PageLoader />

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/admin/attendance" className="text-sm font-medium text-primary-600 hover:underline">
        ← Attendance
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Attendance Scanner</h1>
      <p className="mt-1 text-sm text-slate-500">
        {event.title} • {formatDate(event.start_date)}
      </p>

      <AttendanceScannerPanel eventId={eventId} />
    </div>
  )
}
