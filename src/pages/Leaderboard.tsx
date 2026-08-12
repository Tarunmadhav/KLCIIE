import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { Avatar, EmptyState, PageHeader, PageLoader, SelectInput } from '@/components/ui'
import { fetchAcademicYears, fetchDepartments, fetchLeaderboard, fetchTeams } from '@/lib/queries'
import type { LeaderboardRow } from '@/lib/types'

const medal = (rank: number) => (rank === 1 ? 'bg-amber-100 text-amber-700' : rank === 2 ? 'bg-slate-200 text-slate-700' : rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500')

export default function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [filters, setFilters] = useState({ academic_year: '', department: '', year: '', team: '', period: 'all' })

  useEffect(() => {
    let active = true
    Promise.all([fetchAcademicYears(), fetchDepartments(), fetchTeams()]).then(([ay, d, t]) => {
      if (active) {
        setAcademicYears(ay)
        setDepartments(d)
        setTeams(t)
      }
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchLeaderboard({
      academic_year: filters.academic_year || undefined,
      department: filters.department || undefined,
      year: filters.year || undefined,
      team: filters.team || undefined,
      period: filters.period as 'all' | 'current' | undefined,
    }).then((r) => {
      if (active) {
        setRows(r)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [filters])

  return (
    <div className="container-page py-10">
      <PageHeader
        title="CIIE Leaderboard"
        subtitle="Top members by CIIE Points. Only public profile information is shown."
        actions={<Trophy className="text-primary-500" size={28} />}
      />

      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
        <SelectInput value={filters.academic_year} onChange={(e) => setFilters({ ...filters, academic_year: e.target.value })}>
          <option value="">Academic year</option>
          {academicYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </SelectInput>
        <SelectInput value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}>
          <option value="">Department</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </SelectInput>
        <SelectInput value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })}>
          <option value="">Year</option>
          {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </SelectInput>
        <SelectInput value={filters.team} onChange={(e) => setFilters({ ...filters, team: e.target.value })}>
          <option value="">CIIE team</option>
          {teams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </SelectInput>
        <SelectInput value={filters.period} onChange={(e) => setFilters({ ...filters, period: e.target.value })}>
          <option value="all">All time</option>
          <option value="current">Current period</option>
        </SelectInput>
      </div>

      {loading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Trophy size={40} />} title="No results" subtitle="Try adjusting the filters." />
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[3rem_1fr_6rem] items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-400">
            <span>Rank</span>
            <span>Member</span>
            <span className="text-right">Points</span>
          </div>
          {rows.map((row) => (
            <Link
              key={row.member_id}
              to={`/members/${row.member_id}`}
              className="grid grid-cols-[3rem_1fr_6rem] items-center gap-2 border-b border-slate-100 px-5 py-3 transition last:border-0 hover:bg-slate-50"
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${medal(row.rank)}`}>
                {row.rank}
              </span>
              <span className="flex items-center gap-3">
                <Avatar name={row.full_name} src={row.avatar_url} className="h-9 w-9" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{row.full_name}</span>
                  <span className="block text-xs text-slate-400">
                    {[row.department, row.year_of_study, row.team].filter(Boolean).join(' • ') || row.ciie_id}
                  </span>
                </span>
              </span>
              <span className="text-right font-extrabold text-primary-700">{row.total_points}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
