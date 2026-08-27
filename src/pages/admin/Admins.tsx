import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Shield, ShieldAlert, UserPlus, UserX } from 'lucide-react'
import { Avatar, Badge, Button, EmptyState, Field, PageHeader, PageLoader, SelectInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { fetchAllProfiles } from '@/lib/queries'
import { ADMIN_ROLES, ROLE_LABELS, isSuperAdminRole, type Profile } from '@/lib/types'
import { errorMessage, formatDate } from '@/lib/utils'

type AdminRow = Profile

function PromoteSection({
  icon,
  title,
  fieldLabel,
  options,
  selected,
  onSelect,
  busy,
  onSubmit,
  footer,
}: {
  icon: ReactNode
  title: string
  fieldLabel: string
  options: Profile[]
  selected: string
  onSelect: (v: string) => void
  busy: boolean
  onSubmit: (e: FormEvent, role: typeof ADMIN_ROLES[number]) => void
  footer: ReactNode
}) {
  const [newRole, setNewRole] = useState<typeof ADMIN_ROLES[number]>('event_admin')
  return (
    <div className="card p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
        <span className="text-primary-600">{icon}</span> {title}
      </h2>
      <form onSubmit={(e) => onSubmit(e, newRole)} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Field label={fieldLabel}>
            <SelectInput value={selected} onChange={(e) => onSelect(e.target.value)}>
              <option value="">Select {fieldLabel.toLowerCase()}…</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} {m.ciie_id ? `(${m.ciie_id})` : ''}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <div className="min-w-48">
          <Field label="Admin role">
            <SelectInput value={newRole} onChange={(e) => setNewRole(e.target.value as typeof newRole)}>
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <Button type="submit" disabled={busy}>
          Promote
        </Button>
      </form>
      <p className="mt-2 text-xs text-slate-400">{footer}</p>
    </div>
  )
}

export default function Admins() {
  const { user, isSuperAdmin } = useAuth()
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [users, setUsers] = useState<Profile[]>([])
  const [memberId, setMemberId] = useState('')
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [adminData, memberData, userData] = await Promise.all([
      fetchAllProfiles<Profile>('*', (q) => q.in('role', ADMIN_ROLES).order('full_name')),
      fetchAllProfiles<Profile>('id, full_name, ciie_id, email, status', (q) => q.eq('role', 'member').eq('status', 'active').order('full_name')),
      fetchAllProfiles<Profile>('id, full_name, ciie_id, email, status', (q) => q.eq('role', 'user').eq('status', 'active').order('full_name')),
    ])
    setAdmins(adminData as AdminRow[])
    setMembers(memberData)
    setUsers(userData)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filteredMembers = useMemo(() => members.slice(0, 30), [members])
  const filteredUsers = useMemo(() => users.slice(0, 30), [users])

  const promote = async (kind: 'member' | 'user', e: FormEvent, role: typeof ADMIN_ROLES[number]) => {
    e.preventDefault()
    const targetId = kind === 'member' ? memberId : userId
    if (!targetId) {
      setError(`Choose a ${kind} to promote.`)
      return
    }
    setBusy(true)
    setError('')
    const { error } = await supabase
      .from('profiles')
      .update({ role, status: 'active', mfa_setup_required: isSuperAdminRole(role) })
      .eq('id', targetId)
    setBusy(false)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Admin Promoted', p_entity_type: 'admin', p_entity_id: targetId, p_details: { role, from: kind } })
    if (kind === 'member') setMemberId('')
    else setUserId('')
    load()
  }

  const changeRole = async (admin: AdminRow) => {
    if (!isSuperAdmin) return
    const role = window.prompt(`New role for ${admin.full_name}:`, admin.role)
    if (!role || !(ADMIN_ROLES as string[]).includes(role)) return
    const { error } = await supabase.from('profiles').update({ role }).eq('id', admin.id)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Admin Role Changed', p_entity_type: 'admin', p_entity_id: admin.id, p_details: { role } })
    load()
  }

  const demote = async (admin: AdminRow) => {
    if (!isSuperAdmin) return
    if (!window.confirm(`Remove admin access from ${admin.full_name}?`)) return
    const { error } = await supabase.from('profiles').update({ role: 'member', mfa_setup_required: false }).eq('id', admin.id)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Admin Demoted', p_entity_type: 'admin', p_entity_id: admin.id })
    load()
  }

  const resetMfa = async (admin: AdminRow) => {
    if (!isSuperAdmin) return
    if (!window.confirm(`Force ${admin.full_name} to reconfigure MFA? Their existing recovery codes will be revoked.`)) return
    const { error } = await supabase.rpc('reset_admin_mfa', { p_admin_id: admin.id })
    if (error) {
      setError(errorMessage(error))
      return
    }
    load()
  }

  if (loading) return <PageLoader />

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Admins & MFA"
        subtitle={isSuperAdmin ? 'Promote members or users, change roles and manage MFA enforcement.' : 'View only — only a Super Admin can manage admins.'}
      />

      {isSuperAdmin && (
        <div className="mb-6 grid gap-5 lg:grid-cols-2">
          <PromoteSection
            icon={<UserPlus size={16} />}
            title="Promote member"
            fieldLabel="Member"
            options={filteredMembers}
            selected={memberId}
            onSelect={setMemberId}
            busy={busy}
            onSubmit={(e, role) => promote('member', e, role)}
            footer={
              <>
                Promoted admins are flagged <code>mfa_setup_required</code> — super admin / main admin roles must complete MFA on their next login.
              </>
            }
          />
          <PromoteSection
            icon={<UserX size={16} />}
            title="Promote user"
            fieldLabel="User"
            options={filteredUsers}
            selected={userId}
            onSelect={setUserId}
            busy={busy}
            onSubmit={(e, role) => promote('user', e, role)}
            footer={
              <>
                Promotes a basic account (role <code>user</code>) directly to an admin role. MFA will be required for super admin / main admin on their next login.
              </>
            }
          />
        </div>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {admins.length === 0 ? (
        <EmptyState icon={<Shield size={40} />} title="No admins yet" subtitle="Promote the first member to Super Admin from the SQL seed." />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-100">
            {admins.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Avatar name={a.full_name} src={a.avatar_url} className="h-10 w-10 text-sm" />
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-slate-900">
                      {a.full_name}
                      {a.id === user?.id && <Badge tone="primary">you</Badge>}
                      {a.role === 'super_admin' && <ShieldAlert size={14} className="text-amber-500" />}
                    </p>
                    <p className="text-xs text-slate-400">
                      {ROLE_LABELS[a.role]} • {a.email ?? ''} • last login {formatDate(a.last_login_at)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.mfa_enabled ? 'green' : 'red'}>{a.mfa_enabled ? 'MFA active' : 'MFA not set'}</Badge>
                  {a.mfa_setup_required && <Badge tone="amber">MFA required</Badge>}
                  {isSuperAdmin && (
                    <>
                      <Button variant="ghost" className="!px-2.5 !py-1" onClick={() => changeRole(a)}>
                        Change role
                      </Button>
                      {a.id !== user?.id && (
                        <Button variant="ghost" className="!px-2.5 !py-1" onClick={() => resetMfa(a)} disabled={!a.mfa_enabled}>
                          Reset MFA
                        </Button>
                      )}
                      {a.id !== user?.id && (
                        <Button variant="ghost" className="!px-2.5 !py-1 text-red-500" onClick={() => demote(a)} disabled={a.role === 'super_admin'}>
                          <UserX size={14} /> Remove
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
