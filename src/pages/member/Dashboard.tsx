import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Award, Briefcase, CalendarDays, Crown, Ticket, Users } from 'lucide-react'
import { Badge, EmptyState, PageLoader } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { interviewDateFor, useSettings } from '@/hooks/useSettings'
import { fetchCoordinators, fetchPublishedEvents } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import type { Event, MemberStats, PointsTransaction } from '@/lib/types'
import { formatDate, moneyPoints } from '@/lib/utils'

export default function MemberDashboard() {
  const { user, profile } = useAuth()
  const settings = useSettings()
  const [stats, setStats] = useState<MemberStats | null>(null)
  const [rank, setRank] = useState<number | null>(null)
  const [history, setHistory] = useState<PointsTransaction[]>([])
  const [upcoming, setUpcoming] = useState<Event[]>([])
  const [coords, setCoords] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let active = true
    const load = async () => {
      const [{ data: statsData }, { data: rankData }, { data: txs }, events] = await Promise.all([
        supabase.from('v_member_stats').select('*').eq('member_id', user.id).maybeSingle(),
        supabase.rpc('get_member_rank', { p_member_id: user.id }),
        supabase
          .from('member_points_transactions')
          .select('*, event:events(title)')
          .eq('member_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
        fetchPublishedEvents({ upcomingOnly: true }),
      ])
      const upcomingEvents = events.slice(0, 4)
      const coordMap = await fetchCoordinators(upcomingEvents.map((e) => e.id))
      if (active) {
        setStats((statsData as MemberStats) ?? null)
        setRank((rankData as number | null) ?? null)
        setHistory((txs as PointsTransaction[]) ?? [])
        setUpcoming(upcomingEvents)
        setCoords(coordMap)
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [user])

  if (loading) return <PageLoader />
  if (!stats) {
    return (
      <div className="py-10 text-center">
        <p className="text-lg font-semibold text-slate-700">Welcome, {profile?.full_name ?? 'member'}!</p>
        <p className="mt-1 text-sm text-slate-500">Your dashboard is ready — start by registering for an event.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900">Welcome back, {profile?.full_name?.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">Here's your CIIE activity at a glance.</p>
      </div>

      {(profile?.status === 'pending' || profile?.status === 'recruit') && (
        <div className="mb-6 rounded-xl border border-primary-200 bg-primary-50 p-5">
          <p className="font-bold text-slate-900">
            {profile.status === 'recruit' ? '🎉 You have been recruited to CIIE!' : 'Your CIIE application is under review.'}
          </p>
          {profile.status === 'pending' && (
            <p className="mt-1 text-sm text-slate-600">
              GD &amp; Interview:{' '}
              {interviewDateFor(settings, profile.interview_batch)
                ? <strong>{formatDate(interviewDateFor(settings, profile.interview_batch))}</strong>
                : <strong>date will be announced</strong>}{' '}
              <Link to="/recruit/success" className="ml-1 font-semibold text-primary-600 hover:underline">Details</Link>
            </p>
          )}
        </div>
      )}

      {/* CIIE POINTS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card relative overflow-hidden bg-gradient-to-br from-primary-600 to-primary-900 p-6 text-white">
          <Crown className="absolute right-4 top-4 text-white/20" size={48} />
          <p className="text-xs font-bold uppercase tracking-widest text-primary-200">CIIE Points</p>
          <p className="mt-2 text-4xl font-black">{stats.total_points}</p>
          <p className="mt-1 text-sm text-primary-100">
            {rank ? `Rank #${rank}` : 'Not ranked yet'} • Earn more by attending events
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:col-span-2 lg:col-span-2">
          <Metric icon={<CalendarDays size={16} />} label="Events Attended" value={stats.events_attended} />
          <Metric icon={<Briefcase size={16} />} label="Events Organized" value={stats.events_worked} />
          <Metric icon={<Users size={16} />} label="Volunteer Activities" value={stats.volunteer_activities} />
          <Metric icon={<Award size={16} />} label="Achievements" value={stats.achievements} />
        </div>
      </div>

      {/* UPCOMING EVENTS */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Upcoming Events</h2>
          <Link to="/upcoming-events" className="flex items-center gap-1 text-sm font-semibold text-primary-600 hover:underline">
            View All Events <ArrowRight size={14} />
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState icon={<CalendarDays size={32} />} title="No upcoming events" subtitle="Check the full event list." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {upcoming.map((e) => (
              <Link key={e.id} to={`/events/${e.slug ?? e.id}`} className="card flex items-center justify-between p-4 transition hover:shadow-md">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                    <span className="text-sm font-black leading-none">{new Date(e.start_date).getDate()}</span>
                    <span className="text-[10px] uppercase">
                      {new Date(e.start_date).toLocaleString('en', { month: 'short' })}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {e.venue ?? 'Online'} • {coords[e.id]?.join(', ') ?? '—'}
                    </p>
                  </div>
                </div>
                <Ticket size={18} className="text-primary-500" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* POINTS HISTORY */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Recent Points</h2>
          <Link to="/dashboard/points" className="flex items-center gap-1 text-sm font-semibold text-primary-600 hover:underline">
            Full history <ArrowRight size={14} />
          </Link>
        </div>
        <div className="card divide-y divide-slate-100">
          {history.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No points yet. Attend your first CIIE event!</p>}
          {history.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{tx.description ?? tx.activity_type}</p>
                <p className="text-xs text-slate-400">
                  {tx.event?.title ?? 'General'} • {formatDate(tx.created_at)} {tx.is_automatic && <Badge tone="green">Auto</Badge>}
                </p>
              </div>
              <span className={`font-extrabold ${tx.points >= 0 ? 'text-green-600' : 'text-red-500'}`}>{moneyPoints(tx.points)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">{icon}</span>
      <div>
        <p className="text-xl font-extrabold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  )
}
