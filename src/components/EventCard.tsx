import { Link } from 'react-router-dom'
import { CalendarDays, Clock, MapPin, Users, Video } from 'lucide-react'
import type { Event } from '@/lib/types'
import { formatDate, seatsRemaining } from '@/lib/utils'

interface EventCardProps {
  event: Event
  registrations?: number
  coordinators?: string[]
}

export default function EventCard({ event, registrations = 0, coordinators = [] }: EventCardProps) {
  const seatsLeft = seatsRemaining({ seats: event.seats, registrations })
  const full = seatsLeft <= 0
  const upcoming = new Date(event.start_date) >= startOfToday()
  const deadlinePassed = event.registration_deadline
    ? new Date(event.registration_deadline) < new Date()
    : false

  return (
    <Link
      to={`/events/${event.slug ?? event.id}`}
      className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[1774/887] w-full bg-gradient-to-br from-primary-600 to-primary-800">
        {event.banner_url ? (
          <img src={event.banner_url} alt={event.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-white/90">
            <span className="text-sm font-bold uppercase tracking-widest">{event.category}</span>
          </div>
        )}
        <div className="absolute left-3 top-3">
          <span className="badge bg-white/90 text-primary-700">{event.category}</span>
        </div>
        {event.mode === 'online' && (
          <span className="badge absolute right-3 top-3 bg-slate-900/80 text-white">
            <Video size={12} /> Online
          </span>
        )}
        {event.mode === 'hybrid' && (
          <span className="badge absolute right-3 top-3 bg-slate-900/80 text-white">Hybrid</span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-bold text-slate-900 group-hover:text-primary-700">{event.title}</h3>
        {coordinators.length > 0 && (
          <p className="mt-0.5 text-xs text-slate-500">Coordinator: {coordinators.join(', ')}</p>
        )}

        <div className="mt-3 space-y-1.5 text-sm text-slate-600">
          <p className="flex items-center gap-2">
            <CalendarDays size={15} className="text-slate-400" />
            {formatDate(event.start_date)} {event.start_time ? `• ${event.start_time}` : ''}
          </p>
          <p className="flex items-center gap-2">
            {event.mode === 'online' ? (
              <Video size={15} className="text-slate-400" />
            ) : (
              <MapPin size={15} className="text-slate-400" />
            )}
            {event.venue ?? (event.mode === 'online' ? 'Online' : 'TBA')}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
          {event.status === 'completed' ? (
            <span className="badge badge-slate">Completed</span>
          ) : full ? (
            <span className="badge badge-red">
              <Users size={12} /> Seats full
            </span>
          ) : upcoming ? (
            <span className="badge badge-green">
              <Users size={12} /> {seatsLeft} seats left
            </span>
          ) : (
            <span className="badge badge-amber">
              <Clock size={12} /> {deadlinePassed ? 'Closed' : 'Open'}
            </span>
          )}
          <span className="text-sm font-semibold text-primary-600">View Details →</span>
        </div>
      </div>
    </Link>
  )
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
