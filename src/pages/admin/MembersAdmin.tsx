import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Users } from 'lucide-react'
import { Button, EmptyState, Modal, PageHeader, PageLoader, SelectInput, TextInput } from '@/components/ui'
import MemberAddForm from '@/components/members/MemberAddForm'
import MembersTable, { fetchMemberRows, type MemberRow } from '@/components/members/MembersTable'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS, isAdminRole } from '@/lib/types'

export default function MembersAdmin() {
  const { isSuperAdmin } = useAuth()
  const [rows, setRows] = useState<MemberRow[]>([])
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [listedFilter, setListedFilter] = useState('all')
  const [teams, setTeams] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const load = async () => {
    const [loaded, teamData] = await Promise.all([
      fetchMemberRows(),
      supabase.from('profiles').select('team').not('team', 'is', null),
    ])
    setRows(loaded)
    setTeams(Array.from(new Set((teamData.data ?? []).map((t) => t.team as string).filter(Boolean))).sort())
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    load().catch(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const visibleRows = useMemo(() => rows, [rows])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return visibleRows.filter((r) => {
      if (query && !`${r.full_name ?? ''} ${r.ciie_id ?? ''} ${r.email ?? ''} ${r.domain ?? ''} ${r.phone ?? ''}`.toLowerCase().includes(query)) return false
      if (roleFilter === 'admin') {
        if (!isAdminRole(r.role)) return false
      } else if (roleFilter !== 'all' && r.role !== roleFilter) return false
      if (teamFilter !== 'all' && r.team !== teamFilter) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (listedFilter === 'listed' && !r.is_listed_member) return false
      if (listedFilter === 'unlisted' && r.is_listed_member) return false
      return true
    })
  }, [visibleRows, q, roleFilter, teamFilter, statusFilter, listedFilter])

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Members"
        subtitle={`${visibleRows.length} users`}
        actions={
          isSuperAdmin ? (
            <Button onClick={() => setShowAdd(true)}>
              <Plus size={15} /> Add member
            </Button>
          ) : undefined
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <TextInput className="!pl-9" placeholder="Search name / ID / email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <SelectInput value={listedFilter} onChange={(e) => setListedFilter(e.target.value)}>
          <option value="all">All members</option>
          <option value="listed">Listed only</option>
          <option value="unlisted">Not listed</option>
        </SelectInput>
        <SelectInput value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          <option value="member">Members</option>
          <option value="admin">All admins</option>
          {Object.entries(ROLE_LABELS)
            .filter(([k]) => isAdminRole(k))
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </SelectInput>
        <SelectInput value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
          <option value="all">All teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectInput>
        <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="recruit">Recruited</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </SelectInput>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users size={40} />} title="No users found" subtitle="Users will appear here once they have an account." />
      ) : (
        <MembersTable rows={filtered} />
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add member" footer={<Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>}>
        <MemberAddForm
          onCreated={async () => {
            setShowAdd(false)
            await load()
          }}
        />
      </Modal>
    </div>
  )
}
