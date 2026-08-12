import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { KeyRound, Plus, RefreshCw, Save, Shield, ShieldAlert, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Modal, PageHeader, PageLoader, TextInput, Toggle } from '@/components/ui'
import { FieldListEditor } from '@/components/FieldListEditor'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { RegistrationRole, CustomFieldDef } from '@/lib/types'
import { errorMessage } from '@/lib/utils'
import { rotatingCode, secondsUntilNextStep } from '@/lib/totp'

function useRotatingCode(secret: string) {
  const [code, setCode] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(60)

  useEffect(() => {
    let active = true
    let timer: number | undefined
    const tick = async () => {
      if (!active) return
      setCode(await rotatingCode(secret))
      setCountdown(secondsUntilNextStep())
      timer = window.setTimeout(tick, 1000)
    }
    void tick()
    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [secret])

  return { code, countdown }
}

function CodeBadge({ secret }: { secret: string }) {
  const { code, countdown } = useRotatingCode(secret)
  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary-600">Current code</p>
        <p className="font-mono text-2xl font-black tracking-[0.25em] text-primary-800">
          {code ?? '······'}
        </p>
      </div>
      <div className="ml-auto text-right">
        <p className="text-[10px] uppercase tracking-wider text-primary-500">Changes in</p>
        <p className="flex items-center gap-1 text-sm font-bold text-primary-700">
          <RefreshCw size={12} className={countdown <= 10 ? 'animate-spin' : ''} /> {countdown}s
        </p>
      </div>
    </div>
  )
}

const EMPTY: CustomFieldDef[] = []

export default function RegistrationKeys() {
  const { isSuperAdmin } = useAuth()
  const [rows, setRows] = useState<RegistrationRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newRole, setNewRole] = useState({ role: '', slug: '', label: '', secret: '', requires_keys: true })

  const load = async () => {
    const { data } = await supabase.from('registration_roles').select('*').order('created_at')
    setRows((data ?? []) as RegistrationRole[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const save = async (r: RegistrationRole) => {
    setBusyId(r.id)
    setError('')
    const { error } = await supabase.from('registration_roles').update(r).eq('id', r.id)
    setBusyId(null)
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', {
      p_action: 'Registration Role Updated',
      p_entity_type: 'registration_role',
      p_entity_id: r.id,
      p_details: { role: r.role, slug: r.slug, enabled: r.enabled },
    })
    load()
  }

  const remove = async (r: RegistrationRole) => {
    if (!window.confirm(`Delete registration role "${r.label}"? Existing accounts keep their role.`)) return
    const { error } = await supabase.from('registration_roles').delete().eq('id', r.id)
    if (error) {
      setError(errorMessage(error))
      return
    }
    load()
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!newRole.role.trim() || !newRole.slug.trim() || !newRole.label.trim()) {
      setError('Role, slug and label are all required.')
      return
    }
    if (newRole.requires_keys && !newRole.secret.trim()) {
      setError('A registration key is required when this role needs keys.')
      return
    }
    const { error } = await supabase.from('registration_roles').insert({
      role: newRole.role.trim(),
      slug: newRole.slug.trim().toLowerCase(),
      label: newRole.label.trim(),
      secret: newRole.requires_keys ? newRole.secret.trim() : '',
      signing_secret: crypto.randomUUID().replace(/-/g, ''),
      enabled: true,
      requires_keys: newRole.requires_keys,
      fields: EMPTY,
    })
    if (error) {
      setError(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', {
      p_action: 'Registration Role Created',
      p_entity_type: 'registration_role',
      p_details: { role: newRole.role.trim(), slug: newRole.slug.trim() },
    })
    setNewRole({ role: '', slug: '', label: '', secret: '', requires_keys: true })
    setCreateOpen(false)
    load()
  }

  const updateRow = (id: string, patch: Partial<RegistrationRole>) =>
    setRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const rowsByRole = useMemo(() => rows, [rows])

  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader title="Registration Keys" subtitle="Keys and rotating MFA codes for role-based registration pages." />
        <div className="card flex items-center gap-3 p-6 text-sm text-slate-500">
          <ShieldAlert size={18} className="shrink-0 text-amber-500" />
          Only a Super Admin can view and manage registration keys and MFA codes.
        </div>
      </div>
    )
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Registration Keys"
        subtitle="Manage role-based registration pages. Each page needs the static registration key and the current rotating alphanumeric code."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> New registration role
          </Button>
        }
      />

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {rowsByRole.length === 0 ? (
        <EmptyState
          icon={<KeyRound size={40} />}
          title="No registration roles yet"
          subtitle="Create a role to enable a registration page protected by a key and rotating code."
        />
      ) : (
        <div className="space-y-5">
          {rowsByRole.map((r) => (
            <div key={r.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
                    <Shield size={18} />
                  </span>
                  <div>
                    <p className="flex items-center gap-2 font-bold text-slate-900">
                      {r.label}
                      <Badge tone={r.enabled ? 'green' : 'slate'}>{r.enabled ? 'Enabled' : 'Disabled'}</Badge>
                    </p>
                    <p className="font-mono text-xs text-slate-400">
                      /register/{r.slug} • role: {r.role}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Toggle
                    checked={r.enabled}
                    onChange={(v) => updateRow(r.id, { enabled: v })}
                    label="Enabled"
                  />
                  <Toggle
                    checked={r.requires_keys}
                    onChange={(v) => updateRow(r.id, { requires_keys: v, secret: v ? r.secret : '' })}
                    label="Key required"
                  />
                  <button className="btn-ghost !px-2.5 !py-1.5 text-red-500" onClick={() => remove(r)} aria-label="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-2">
                <div className="space-y-4">
                  {r.requires_keys ? (
                    <>
                      <div>
                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">Static registration key</p>
                        <TextInput
                          value={r.secret}
                          onChange={(e) => updateRow(r.id, { secret: e.target.value })}
                          placeholder="Set the registration key"
                          className="!font-mono"
                        />
                      </div>
                      <CodeBadge secret={r.secret} />
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                      No key or MFA code required — anyone with the direct link can register for this role.
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="label">Label</span>
                      <TextInput value={r.label} onChange={(e) => updateRow(r.id, { label: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="label">Role</span>
                      <TextInput value={r.role} onChange={(e) => updateRow(r.id, { role: e.target.value })} className="!font-mono" />
                    </label>
                  </div>

                  <Button variant="secondary" className="w-full" disabled={busyId === r.id} onClick={() => save(r)}>
                    <Save size={15} /> Save changes
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Registration details (all mandatory)</p>
                  <FieldListEditor
                    fields={r.fields ?? []}
                    hint="Fields shown on this role's registration page. Every field is mandatory."
                    onChange={(fields) => updateRow(r.id, { fields })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New registration role">
        <form onSubmit={create} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label">
              <TextInput required value={newRole.label} onChange={(e) => setNewRole({ ...newRole, label: e.target.value })} placeholder="e.g. Events Team" />
            </Field>
            <Field label="Role">
              <TextInput required value={newRole.role} onChange={(e) => setNewRole({ ...newRole, role: e.target.value })} placeholder="e.g. events_team" className="!font-mono" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="URL slug" hint="Registration page becomes /register/<slug>">
              <TextInput required value={newRole.slug} onChange={(e) => setNewRole({ ...newRole, slug: e.target.value.toLowerCase() })} placeholder="e.g. events-team" className="!font-mono" />
            </Field>
            <div className="flex items-end pb-1">
              <Toggle
                checked={newRole.requires_keys}
                onChange={(v) => setNewRole({ ...newRole, requires_keys: v })}
                label="Require key & MFA code"
              />
            </div>
          </div>
          {newRole.requires_keys && (
            <Field label="Registration key" hint="Users must enter this static key">
              <TextInput required value={newRole.secret} onChange={(e) => setNewRole({ ...newRole, secret: e.target.value })} placeholder="e.g. CIIE-2026-TEAM" className="!font-mono" />
            </Field>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <Plus size={15} /> Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
