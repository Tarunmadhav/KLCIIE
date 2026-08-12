import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, CalendarDays, CheckCircle2, Crown, Trophy, Users } from 'lucide-react'
import { Avatar, PageLoader } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { fetchLeaderboard } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import type { LeaderboardRow } from '@/lib/types'

interface PointsStats {
  total_points_awarded: number
  total_transactions: number
  active_members: number
  upcoming_events: number
  events_conducted: number
}

export default function AdminDashboard() {
  const { isSuperAdmin } = useAuth()
  const [stats, setStats] = useState<PointsStats | null>(null)
  const [top, setTop] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      const [{ data: statsData }, topRows] = await Promise.all([
        supabase.rpc('get_points_stats'),
        fetchLeaderboard(),
      ])
      if (active) {
        setStats((statsData as PointsStats) ?? null)
        setTop(topRows.slice(0, 5))
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <PageLoader />

  const cards = [
    { label: 'Total CIIE Points Awarded', value: stats?.total_points_awarded ?? 0, icon: Trophy, tone: 'bg-primary-100 text-primary-600' },
    { label: 'Active Members', value: stats?.active_members ?? 0, icon: Users, tone: 'bg-green-100 text-green-600' },
    { label: 'Upcoming Events', value: stats?.upcoming_events ?? 0, icon: CalendarDays, tone: 'bg-amber-100 text-amber-600' },
    { label: 'Events Conducted', value: stats?.events_conducted ?? 0, icon: CheckCircle2, tone: 'bg-sky-100 text-sky-600' },
  ]

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold text-slate-900">Admin Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${c.tone}`}>
              <c.icon size={18} />
            </span>
            <p className="text-2xl font-extrabold text-slate-900">{c.value}</p>
            <p className="text-xs text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="flex items-center gap-2 font-bold text-slate-900">
              <Crown size={16} className="text-amber-500" /> Top CIIE Members
            </h2>
            <Link to="/admin/members" className="text-sm font-semibold text-primary-600 hover:underline">
              Manage
            </Link>
          </div>
          {top.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No points awarded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {top.map((m, i) => (
                <Link key={m.member_id} to={`/admin/members/${m.member_id}`} className="flex items-center justify-between px-5 py-3 transition hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-sm font-bold text-slate-400">{i + 1}</span>
                    <Avatar name={m.full_name} src={m.avatar_url} className="h-8 w-8 text-xs" />
                    <span className="text-sm font-semibold text-slate-800">{m.full_name}</span>
                  </div>
                  <span className="font-extrabold text-primary-700">{m.total_points}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-900">
            <Award size={16} className="text-primary-600" /> Quick Actions
          </h2>
          <div className="mt-4 grid gap-2">
            <Link to="/admin/events/new" className="btn-primary w-full">Create event</Link>
            {isSuperAdmin && <Link to="/admin/points" className="btn-secondary w-full">Award points manually</Link>}
            <Link to="/admin/attendance" className="btn-secondary w-full">Open attendance scanner</Link>
            <Link to="/admin/branding" className="btn-secondary w-full">Update CIIE branding</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
