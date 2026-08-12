import { useEffect, useMemo, useState } from 'react'
import EventCard from '@/components/EventCard'
import { PageHeader, PageLoader, SelectInput } from '@/components/ui'
import { fetchCoordinators, fetchEventCounts, fetchPublishedEvents } from '@/lib/queries'
import type { Event } from '@/lib/types'

export default function EventsList() {
  const [events, setEvents] = useState<Event[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [coords, setCoords] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('all')

  useEffect(() => {
    let active = true
    const load = async () => {
      const published = await fetchPublishedEvents()
      const completed = await fetchPublishedEvents({ status: 'completed' })
      const all = [...published, ...completed]
      const countMap = await fetchEventCounts()
      const coordMap = await fetchCoordinators(all.map((e) => e.id))
      if (active) {
        setEvents(all)
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

  const categories = useMemo(() => Array.from(new Set(events.map((e) => e.category))), [events])
  const filtered = useMemo(
    () => (category === 'all' ? events : events.filter((e) => e.category === category)),
    [events, category],
  )

  return (
    <div className="container-page py-10">
      <PageHeader
        title="CIIE Events"
        subtitle="Workshops, hackathons, summits and more."
        actions={
          <SelectInput value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectInput>
        }
      />
      {loading ? (
        <PageLoader />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e) => (
            <EventCard key={e.id} event={e} registrations={counts[e.id] ?? 0} coordinators={coords[e.id]} />
          ))}
        </div>
      )}
    </div>
  )
}
