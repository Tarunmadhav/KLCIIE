import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Clock, MapPin, Users } from 'lucide-react'
import { Badge, EmptyState, PageLoader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/types'
import { formatDate, isEventEnded } from '@/lib/utils'

export default function FacultyEvents() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('events')
      .select('*')
      .eq('audience', 'faculty')
      .in('status', ['published', 'completed'])
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        if (!active) return
        setEvents((data ?? []) as Event[])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) return <PageLoader />

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        You never need to register for these events — your attendance QR is generated automatically. Open{' '}
        <Link to="/faculty/qr" className="font-semibold text-primary-600 hover:underline">
          QR Attendance
        </Link>{' '}
        during a round's window to show it.
      </p>

      {events.length === 0 ? (
        <EmptyState icon={<CalendarDays size={40} />} title="No faculty events yet" subtitle="Events posted here will appear automatically." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((e) => {
            const ended = isEventEnded(e)
            return (
              <div key={e.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold leading-snug text-slate-900">{e.title}</h3>
                  <Badge tone={ended ? 'slate' : 'green'}>{ended ? 'Ended' : 'Upcoming'}</Badge>
                </div>
                <div className="mt-3 space-y-1.5 text-sm text-slate-500">
                  <p className="flex items-center gap-1.5">
                    <CalendarDays size={15} /> {formatDate(e.start_date)}
                    {e.start_time ? ` · ${e.start_time}` : ''}
                  </p>
                  {e.venue && (
                    <p className="flex items-center gap-1.5">
                      <MapPin size={15} /> {e.venue}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <Users size={15} /> {e.attendance_rounds} attendance round{e.attendance_rounds === 1 ? '' : 's'}
                  </p>
                  {e.coordinator_note && (
                    <p className="flex items-center gap-1.5">
                      <Clock size={15} /> {e.coordinator_note}
                    </p>
                  )}
                </div>
                {!ended && (
                  <Link to="/faculty/qr" className="btn-secondary mt-4">
                    Get attendance QR
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
