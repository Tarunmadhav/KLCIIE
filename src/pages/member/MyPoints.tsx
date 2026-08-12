import { useEffect, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Badge, EmptyState, Modal, PageLoader } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { MemberStats, PointsTransaction } from '@/lib/types'
import { cn, formatDate, formatDateTime, moneyPoints } from '@/lib/utils'

function humanize(s: string) {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function DetailRow({ label, value, full, mono }: { label: string; value: ReactNode; full?: boolean; mono?: boolean }) {
  return (
    <div className={cn('grid gap-1 px-5 py-3', full ? '' : 'sm:grid-cols-3')}>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={cn('text-sm text-slate-800', full ? 'mt-0.5' : 'sm:col-span-2', mono && 'font-mono text-xs')}>
        {value ?? '—'}
      </dd>
    </div>
  )
}

export default function MyPoints() {
  const { user } = useAuth()
  const [stats, setStats] = useState<MemberStats | null>(null)
  const [rank, setRank] = useState<number | null>(null)
  const [history, setHistory] = useState<PointsTransaction[]>([])
  const [selected, setSelected] = useState<PointsTransaction | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let active = true
    const load = async () => {
      const [{ data: statsData }, { data: rankData }, { data: txs }] = await Promise.all([
        supabase.from('v_member_stats').select('*').eq('member_id', user.id).maybeSingle(),
        supabase.rpc('get_member_rank', { p_member_id: user.id }),
        supabase
          .from('member_points_transactions')
          .select('*, event:events(title, description, start_date), awarded_by_profile:profiles!awarded_by(full_name)')
          .eq('member_id', user.id)
          .order('created_at', { ascending: false }),
      ])
      if (active) {
        setStats((statsData as MemberStats) ?? null)
        setRank((rankData as number | null) ?? null)
        setHistory((txs as PointsTransaction[]) ?? [])
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
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="card flex h-24 w-40 flex-col justify-center p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Current Points</p>
          <p className="text-3xl font-black text-primary-700">{stats?.total_points ?? 0}</p>
        </div>
        <div className="card flex h-24 w-40 flex-col justify-center p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Rank</p>
          <p className="text-3xl font-black text-slate-900">{rank ? `#${rank}` : '—'}</p>
        </div>
        <div className="card flex h-24 flex-1 items-center justify-between p-4">
          <div className="text-sm text-slate-500">
            <p>Events attended: <b className="text-slate-900">{stats?.events_attended ?? 0}</b></p>
            <p>Events worked on: <b className="text-slate-900">{stats?.events_worked ?? 0}</b></p>
            <p>Volunteer activities: <b className="text-slate-900">{stats?.volunteer_activities ?? 0}</b></p>
            <p>Achievements: <b className="text-slate-900">{stats?.achievements ?? 0}</b></p>
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-bold text-slate-900">Points History</h2>
      {history.length === 0 ? (
        <EmptyState title="No transactions yet" subtitle="Points appear here when you attend events, volunteer or get recognized." />
      ) : (
        <div className="card divide-y divide-slate-100">
          {history.map((tx) => (
            <button
              key={tx.id}
              type="button"
              onClick={() => setSelected(tx)}
              className="flex w-full items-center justify-between px-5 py-3 text-left transition hover:bg-primary-50/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{tx.description ?? humanize(tx.activity_type)}</p>
                <p className="text-xs text-slate-400">
                  {formatDate(tx.created_at)} • {tx.event?.title ?? 'General'}
                  {tx.awarded_by_profile ? ` • by ${tx.awarded_by_profile.full_name}` : ''}
                  {tx.is_automatic && <Badge tone="green" className="ml-2">Auto</Badge>}
                  {!tx.is_automatic && <Badge tone="primary" className="ml-2">Manual</Badge>}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1">
                <span className={`font-extrabold ${tx.points >= 0 ? 'text-green-600' : 'text-red-500'}`}>{moneyPoints(tx.points)}</span>
                <ChevronRight size={15} className="text-slate-300" />
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Points Detail — ${selected?.event?.title ?? 'General'}`}
      >
        {selected && (
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            <div className="grid gap-1 px-5 py-3 sm:grid-cols-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Points</dt>
              <dd className={`text-sm font-extrabold sm:col-span-2 ${selected.points >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {moneyPoints(selected.points)}
              </dd>
            </div>
            <DetailRow label="Activity type" value={humanize(selected.activity_type)} />
            <DetailRow label="Description" value={selected.description ?? '—'} full />
            <DetailRow label="Event" value={selected.event?.title ?? 'General'} />
            {selected.event?.description && <DetailRow label="Event description" value={selected.event.description} full />}
            {selected.event?.start_date && <DetailRow label="Event date" value={formatDate(selected.event.start_date)} />}
            <DetailRow label="Awarded by" value={selected.awarded_by_profile?.full_name ?? '—'} />
            <DetailRow label="Awarded on" value={formatDateTime(selected.created_at)} />
            <div className="grid gap-1 px-5 py-3 sm:grid-cols-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Type</dt>
              <dd className="text-sm sm:col-span-2">
                {selected.is_automatic ? <Badge tone="green">Auto</Badge> : <Badge tone="primary">Manual</Badge>}
              </dd>
            </div>
          </dl>
        )}
      </Modal>
    </div>
  )
}
