import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Trash2, UserCog } from 'lucide-react'
import { Avatar, Badge, Button, EmptyState, PageHeader, PageLoader, SelectInput, Spinner, TextInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { ADMIN_ROLES, ROLE_LABELS, type Profile, type Role } from '@/lib/types'
import { cn, errorMessage } from '@/lib/utils'

const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[]

const isAdminRoleValue = (role: Role) => (ADMIN_ROLES as string[]).includes(role)

export default function UserRoles() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [roleByUser, setRoleByUser] = useState<Record<string, Role>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, full_name, email, ciie_id, role, status, department, year_of_study')
      .order('full_name', { ascending: true })
    if (err) {
      setError(errorMessage(err))
    } else {
      setRows((data ?? []) as Profile[])
      const map: Record<string, Role> = {}
      for (const r of (data ?? []) as Profile[]) map[r.id] = r.role
      setRoleByUser(map)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        (r.full_name ?? '').toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.ciie_id ?? '').toLowerCase().includes(q),
    )
  }, [rows, query])

  const changeRole = async (row: Profile) => {
    if (row.id === user?.id) {
      setError('You cannot change your own role from this page.')
      return
    }
    const newRole = roleByUser[row.id]
    if (!newRole || newRole === row.role) return
    setBusyId(row.id)
    setError('')
    setSaved('')
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: newRole, mfa_setup_required: isAdminRoleValue(newRole) })
      .eq('id', row.id)
    if (err) {
      setBusyId(null)
      setError(errorMessage(err))
      return
    }
    await supabase.rpc('log_admin_event', {
      p_action: 'User Role Changed',
      p_entity_type: 'user',
      p_entity_id: row.id,
      p_details: { from: row.role, to: newRole, email: row.email },
    })
    setBusyId(null)
    setSaved(`Role updated for ${row.full_name ?? row.email ?? 'user'} → ${ROLE_LABELS[newRole]}.`)
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, role: newRole } : r)))
  }

  const removeUser = async (row: Profile) => {
    if (row.id === user?.id) {
      setError('You cannot delete your own account.')
      return
    }
    if (!window.confirm(`Delete ${row.full_name ?? row.email ?? 'this user'}? This permanently removes their account, profile, MFA, QR codes and related data. This cannot be undone.`))
      return
    setBusyId(row.id)
    setError('')
    setSaved('')
    const { data, error: err } = await supabase.rpc('admin_delete_user', { p_user_id: row.id })
    if (err || (data && data.error)) {
      setBusyId(null)
      setError(err ? errorMessage(err) : (data as { error: string }).error)
      return
    }
    setBusyId(null)
    setSaved(`Deleted ${row.full_name ?? row.email ?? 'user'}.`)
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    setRoleByUser((prev) => {
      const next = { ...prev }
      delete next[row.id]
      return next
    })
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="User Roles"
        subtitle="Change any user's role — user, member, CIIE member or any admin role. Admin roles are flagged MFA-required."
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw size={15} /> Refresh
          </Button>
        }
      />

      <div className="mb-4 max-w-md">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${rows.length} users by name, email or CIIE ID…`}
        />
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{saved}</p>}

      {filtered.length === 0 ? (
        <EmptyState icon={<UserCog size={36} />} title="No users found" subtitle="Try a different search, or there are no users yet." />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={row.full_name} className="h-9 w-9 text-xs" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-semibold text-slate-900">
                      {row.full_name ?? '—'}
                      {row.id === user?.id && <Badge tone="primary">you</Badge>}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {row.email ?? ''} {row.ciie_id ? `• ${row.ciie_id}` : ''} {row.department ? `• ${row.department}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={row.status === 'active' ? 'green' : 'amber'}>{row.status}</Badge>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {ROLE_LABELS[row.role]}
                  </span>
                  {row.id !== user?.id && (
                    <SelectInput
                      value={roleByUser[row.id]}
                      onChange={(e) => setRoleByUser((prev) => ({ ...prev, [row.id]: e.target.value as Role }))}
                      className="!w-48 !py-1.5 !text-xs"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </SelectInput>
                  )}
                  <Button
                    variant="ghost"
                    className={cn('!px-2.5 !py-1 !text-xs', roleByUser[row.id] === row.role && 'pointer-events-none opacity-40')}
                    disabled={row.id === user?.id || busyId !== null || roleByUser[row.id] === row.role}
                    onClick={() => void changeRole(row)}
                  >
                    {busyId === row.id ? <Spinner className="h-3.5 w-3.5" /> : 'Change'}
                  </Button>
                  <Button
                    variant="danger"
                    className="!px-2 !py-1 !text-xs"
                    disabled={row.id === user?.id || busyId !== null}
                    onClick={() => void removeUser(row)}
                  >
                    {busyId === row.id ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 size={13} />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
