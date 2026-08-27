import { useEffect, useMemo, useState } from 'react'
import { Clock, RefreshCw, TimerReset, Trash2, UserCog } from 'lucide-react'
import { Avatar, Badge, Button, EmptyState, Modal, PageHeader, PageLoader, SelectInput, Spinner, TextInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { fetchAllProfiles } from '@/lib/queries'
import { ADMIN_ROLES, ROLE_LABELS, type Profile, type Role } from '@/lib/types'
import { cn, errorMessage, formatDateTime } from '@/lib/utils'

const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[]

const isAdminRoleValue = (role: Role) => (ADMIN_ROLES as string[]).includes(role)

function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function hasActiveTemp(row: Profile): boolean {
  return !!row.temp_role_expires_at && new Date(row.temp_role_expires_at) > new Date()
}

export default function UserRoles() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [roleByUser, setRoleByUser] = useState<Record<string, Role>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [tempRow, setTempRow] = useState<Profile | null>(null)
  const [tempRole, setTempRole] = useState<Role>('member_ciie')
  const [tempUntil, setTempUntil] = useState('')

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    // Sweep expired temporary roles server-side first so the list is accurate.
    await supabase.rpc('expire_temporary_roles')
    try {
      const data = await fetchAllProfiles<Profile>(
        'id, full_name, email, ciie_id, role, status, department, year_of_study, pre_temp_role, temp_role_expires_at',
        (q) => q.order('full_name', { ascending: true }),
      )
      setRows(data)
      const map: Record<string, Role> = {}
      for (const r of data) map[r.id] = r.role
      setRoleByUser(map)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
    if (!silent) setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  // Keep countdowns honest: re-sweep + refresh every minute.
  useEffect(() => {
    const id = window.setInterval(() => void load(true), 60000)
    return () => window.clearInterval(id)
  }, [])

  // Live view: silently re-fetch straight from the DB whenever the tab
  // regains focus or becomes visible again, so deletions/edits made
  // elsewhere are always reflected without a manual refresh.
  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    window.addEventListener('focus', refetch)
    document.addEventListener('visibilitychange', refetch)
    return () => {
      window.removeEventListener('focus', refetch)
      document.removeEventListener('visibilitychange', refetch)
    }
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
      .update({ role: newRole, mfa_setup_required: isAdminRoleValue(newRole), pre_temp_role: null, temp_role_expires_at: null })
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

  // ------------------------------------------------------------------
  // Temporary role change
  // ------------------------------------------------------------------
  const baseRoleOf = (row: Profile): Role =>
    hasActiveTemp(row) ? (row.pre_temp_role ?? row.role) : row.role

  const openTempModal = (row: Profile) => {
    setError('')
    setSaved('')
    setTempRow(row)
    const base = baseRoleOf(row)
    setTempRole(ALL_ROLES.find((r) => r !== base) ?? 'user')
    setTempUntil(toLocalInputValue(new Date(Date.now() + 60 * 60 * 1000)))
  }

  const applyTempRole = async () => {
    if (!tempRow || busyId) return
    const untilMs = tempUntil ? new Date(tempUntil).getTime() : NaN
    if (!Number.isFinite(untilMs) || untilMs <= Date.now()) {
      setError('Pick a date & time in the future for the temporary role to end.')
      return
    }
    const base = baseRoleOf(tempRow)
    if (tempRole === base) {
      setError('Choose a different role from their original one.')
      return
    }
    setBusyId(tempRow.id)
    setError('')
    const untilIso = new Date(tempUntil).toISOString()
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: tempRole, pre_temp_role: base, temp_role_expires_at: untilIso, mfa_setup_required: isAdminRoleValue(tempRole) })
      .eq('id', tempRow.id)
    if (err) {
      setBusyId(null)
      setError(errorMessage(err))
      return
    }
    await supabase.rpc('log_admin_event', {
      p_action: 'Temporary Role Set',
      p_entity_type: 'user',
      p_entity_id: tempRow.id,
      p_details: { from: base, to: tempRole, until: untilIso, email: tempRow.email },
    })
    setBusyId(null)
    setSaved(`${tempRow.full_name ?? 'User'} is now ${ROLE_LABELS[tempRole]} until ${formatDateTime(untilIso)} — then back to ${ROLE_LABELS[base]}.`)
    setTempRow(null)
    void load(true)
  }

  const removeTempRole = async () => {
    if (!tempRow || busyId) return
    setBusyId(tempRow.id)
    setError('')
    const base = baseRoleOf(tempRow)
    const { error: err } = await supabase
      .from('profiles')
      .update({
        role: base,
        pre_temp_role: null,
        temp_role_expires_at: null,
        mfa_setup_required: isAdminRoleValue(base),
      })
      .eq('id', tempRow.id)
    if (err) {
      setBusyId(null)
      setError(errorMessage(err))
      return
    }
    await supabase.rpc('log_admin_event', {
      p_action: 'Temporary Role Removed',
      p_entity_type: 'user',
      p_entity_id: tempRow.id,
      p_details: { restored: base, email: tempRow.email },
    })
    setBusyId(null)
    setSaved(`Restored ${tempRow.full_name ?? 'user'} to ${ROLE_LABELS[base]}.`)
    setTempRow(null)
    void load(true)
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
                  {row.id !== user?.id &&
                    (hasActiveTemp(row) ? (
                      <button
                        type="button"
                        onClick={() => openTempModal(row)}
                        title="Edit or remove the temporary role"
                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-200"
                      >
                        <Clock size={12} /> Temp {ROLE_LABELS[row.role]} · till {formatDateTime(row.temp_role_expires_at!)}
                      </button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 !text-xs"
                        disabled={busyId !== null}
                        title="Temporary role change — give a role until a set date & time"
                        onClick={() => openTempModal(row)}
                      >
                        <Clock size={13} /> Temp role
                      </Button>
                    ))}
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

      <Modal
        open={!!tempRow}
        onClose={() => setTempRow(null)}
        title={tempRow ? `Temporary role — ${tempRow.full_name ?? tempRow.email ?? 'user'}` : 'Temporary role'}
        footer={
          <>
            {tempRow && hasActiveTemp(tempRow) && (
              <Button variant="danger" onClick={() => void removeTempRole()} disabled={busyId !== null}>
                <TimerReset size={15} /> End now
              </Button>
            )}
            <Button variant="ghost" onClick={() => setTempRow(null)}>
              Cancel
            </Button>
            <Button onClick={() => void applyTempRole()} disabled={busyId !== null}>
              {busyId ? <Spinner className="h-4 w-4" /> : 'Apply temporary role'}
            </Button>
          </>
        }
      >
        {tempRow && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              Original role: <strong className="text-slate-900">{ROLE_LABELS[baseRoleOf(tempRow)]}</strong>
            </p>
            <div className="max-w-xs">
              <label className="mb-1.5 block text-sm font-bold text-slate-900">Temporary role</label>
              <SelectInput value={tempRole} onChange={(e) => setTempRole(e.target.value as Role)}>
                {ALL_ROLES.filter((r) => r !== baseRoleOf(tempRow)).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className="max-w-xs">
              <label className="mb-1.5 block text-sm font-bold text-slate-900">Revert automatically at (date &amp; time)</label>
              <TextInput
                type="datetime-local"
                value={tempUntil}
                min={toLocalInputValue(new Date())}
                onChange={(e) => setTempUntil(e.target.value)}
              />
            </div>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Until then the user acts as <strong>{ROLE_LABELS[tempRole]}</strong>. After this moment their role
              reverts to <strong>{ROLE_LABELS[baseRoleOf(tempRow)]}</strong> automatically.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
