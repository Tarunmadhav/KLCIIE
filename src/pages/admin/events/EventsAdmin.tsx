import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Ticket } from 'lucide-react'
import { Badge, EmptyState, PageHeader, PageLoader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/types'
import { formatDate } from '@/lib/utils'

interface EventStats {
  event_id: string
  title: string
  status: string
  start_date: string
  registrations: number
  present: number
  absent: number
  team_size: number
  certificates: number
}

export default function EventsAdmin() {
  const [events, setEvents] = useState<Event[]>([])
  const [stats, setStats] = useState<Record<string, EventStats>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data: eventsData } = await supabase.from('events').select('*').order('start_date', { ascending: false })
      const { data: statsData } = await supabase.rpc('admin_get_event_stats')
      if (active) {
        setEvents((eventsData ?? []) as Event[])
        const map: Record<string, EventStats> = {}
        for (const s of (statsData ?? []) as EventStats[]) map[s.event_id] = s
        setStats(map)
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Create and manage CIIE events."
        actions={
          <Link to="/admin/events/new" className="btn-primary">
            <Plus size={16} /> New event
          </Link>
        }
      />

      {events.length === 0 ? (
        <EmptyState icon={<Ticket size={40} />} title="No events yet" subtitle="Create your first CIIE event." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Event</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Registrations</th>
                <th className="px-5 py-3">Team</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((e) => {
                const s = stats[e.id]
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link to={`/admin/events/${e.id}`} className="font-semibold text-slate-900 hover:text-primary-600">
                        {e.title}
                      </Link>
                      <p className="text-xs text-slate-400">{e.category} • {e.venue ?? e.mode}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{formatDate(e.start_date)}</td>
                    <td className="px-5 py-3 text-slate-600">{s?.registrations ?? 0} ({s?.present ?? 0} present)</td>
                    <td className="px-5 py-3 text-slate-600">{s?.team_size ?? 0}</td>
                    <td className="px-5 py-3">
                      <Badge tone={e.status === 'published' ? 'green' : e.status === 'completed' ? 'slate' : e.status === 'cancelled' ? 'red' : 'amber'}>
                        {e.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link to={`/events/${e.slug ?? e.id}`} className="btn-ghost !px-2.5 !py-1">View</Link>
                        <Link to={`/admin/events/${e.id}/team`} className="btn-ghost !px-2.5 !py-1">Team</Link>
                        <Link to={`/admin/events/${e.id}/edit`} className="btn-secondary !px-2.5 !py-1">Edit</Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
