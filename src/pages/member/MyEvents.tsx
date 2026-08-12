import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Ticket } from 'lucide-react'
import { Badge, EmptyState, PageLoader } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Attendance, EventRegistration } from '@/lib/types'
import { formatDate } from '@/lib/utils'

type Row = EventRegistration & { event?: { id: string; title: string; start_date: string } | null; attendance?: Attendance[] | null }

interface TeamRow {
  id: string
  event_id: string
  hours_worked: number
  is_public: boolean
  created_at: string
  event?: { id: string; title: string; start_date: string } | null
  role?: { name: string; category: string } | null
}

export default function MyEvents() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [teamRows, setTeamRows] = useState<TeamRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let active = true
    const load = async () => {
      const [{ data }, { data: teamData }] = await Promise.all([
        supabase
          .from('event_registrations')
          .select('*, event:events(id, title, start_date), attendance:attendance(*)')
          .eq('member_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('event_team_members')
          .select('*, event:events(id, title, start_date), role:event_roles(name, category)')
          .eq('member_id', user.id)
          .order('created_at', { ascending: false }),
      ])
      if (active) {
        setRows((data ?? []) as Row[])
        setTeamRows((teamData ?? []) as TeamRow[])
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [user])

  if (loading) return <PageLoader />

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">My Events</h1>
      <p className="mt-1 text-sm text-slate-500">Registrations, tickets, attendance and event team assignments.</p>

      {teamRows.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Briefcase size={16} className="text-primary-600" /> Events assigned to me
          </h2>
          <div className="mt-3 space-y-3">
            {teamRows.map((t) => (
              <div key={t.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link to={`/events/${t.event?.id ?? t.event_id}`} className="font-bold text-slate-900 hover:text-primary-600">
                    {t.event?.title ?? 'Event'}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {t.event?.start_date ? formatDate(t.event.start_date) : ''} • {t.role?.name ?? 'Team role'} •{' '}
                    {t.is_public ? 'Public' : 'Internal'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="primary">{t.role?.name ?? 'Team'}</Badge>
                  <Badge tone={t.hours_worked > 0 ? 'green' : 'slate'}>{t.hours_worked} h worked</Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-base font-bold text-slate-900">My registrations</h2>
        {rows.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={<Ticket size={40} />}
              title="No registrations yet"
              subtitle="Register for an event to see it here."
              action={
                <Link to="/upcoming-events" className="btn-primary">
                  Browse events
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link to={`/events/${r.event?.id}`} className="font-bold text-slate-900 hover:text-primary-600">
                    {r.event?.title ?? 'Event'}
                  </Link>
                  <p className="text-xs text-slate-400">
                    Registered {formatDate(r.created_at)} • {r.registration_code}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {(r.attendance ?? []).some((a) => a.status === 'present') && <Badge tone="green">Present</Badge>}
                  {r.status === 'cancelled' && <Badge tone="red">Cancelled</Badge>}
                  {r.status === 'confirmed' && (r.attendance?.length ?? 0) === 0 && <Badge tone="slate">Registered</Badge>}
                  <Link to={`/register/success/${r.id}`} className="btn-secondary !px-3 !py-1.5">
                    <Ticket size={14} /> Ticket
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
