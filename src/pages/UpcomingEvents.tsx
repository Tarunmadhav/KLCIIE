import { useEffect, useState } from 'react'
import EventCard from '@/components/EventCard'
import { EmptyState, PageHeader, PageLoader } from '@/components/ui'
import { fetchCoordinators, fetchEventCounts, fetchPublishedEvents } from '@/lib/queries'
import type { Event } from '@/lib/types'
import { CalendarClock } from 'lucide-react'

export default function UpcomingEvents() {
  const [events, setEvents] = useState<Event[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [coords, setCoords] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      const upcoming = await fetchPublishedEvents({ upcomingOnly: true })
      const countMap = await fetchEventCounts()
      const coordMap = await fetchCoordinators(upcoming.map((e) => e.id))
      if (active) {
        setEvents(upcoming)
        setCounts(countMap)
        setCoords(coordMap)
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="container-page py-10">
      <PageHeader
        title="Upcoming Events"
        subtitle="Published events scheduled in the future. Completed events move out automatically."
      />
      {loading ? (
        <PageLoader />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={40} />}
          title="No upcoming events"
          subtitle="New CIIE events will appear here once published."
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} registrations={counts[e.id] ?? 0} coordinators={coords[e.id]} />
          ))}
        </div>
      )}
    </div>
  )
}
