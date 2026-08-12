import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { Badge, Button, Field, PageHeader, PageLoader, SelectInput, TextArea, TextInput, Toggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { EventRole } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

const CATEGORIES = ['coordinator', 'volunteer', 'speaker', 'organizer', 'support', 'other']

const empty = { name: '', description: '', category: 'other', display_order: '0', award_points: false, default_points: '0', is_active: true }

export default function EventRoles() {
  const [roles, setRoles] = useState<EventRole[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const { data } = await supabase.from('event_roles').select('*').order('display_order')
    setRoles((data ?? []) as EventRole[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const startEdit = (r: EventRole) => {
    setEditing(r.id)
    setForm({
      name: r.name,
      description: r.description ?? '',
      category: r.category,
      display_order: String(r.display_order),
      award_points: r.award_points,
      default_points: String(r.default_points),
      is_active: r.is_active,
    })
    setError('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      name: form.name,
      description: form.description || null,
      category: form.category,
      display_order: Number(form.display_order) || 0,
      award_points: form.award_points,
      default_points: Number(form.default_points) || 0,
      is_active: form.is_active,
    }
    let err: unknown
    if (editing) {
      const { error } = await supabase.from('event_roles').update(payload).eq('id', editing)
      err = error
    } else {
      const { error } = await supabase.from('event_roles').insert(payload)
      err = error
    }
    setBusy(false)
    if (err) {
      setError(errorMessage(err))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: editing ? 'Role Updated' : 'Role Created', p_entity_type: 'role', p_entity_id: editing ?? undefined })
    setEditing(null)
    setForm({ ...empty })
    load()
  }

  const remove = async (r: EventRole) => {
    if (!window.confirm(`Delete role "${r.name}"? Existing assignments will be removed.`)) return
    const { error } = await supabase.from('event_roles').delete().eq('id', r.id)
    if (error) {
      alert(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Role Deleted', p_entity_type: 'role', p_entity_id: r.id })
    load()
  }

  if (loading) return <PageLoader />

  return (
    <div className="max-w-4xl">
      <PageHeader title="Event Roles" subtitle="Roles admins can assign to team members. Points can be awarded automatically per role." />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card h-fit p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            {editing ? <Pencil size={16} /> : <Plus size={16} />} {editing ? 'Edit role' : 'New role'}
          </h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Name">
              <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Event Coordinator" />
            </Field>
            <Field label="Category">
              <SelectInput value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Description">
              <TextArea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Display order">
                <TextInput type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
              </Field>
              <Field label="Default points" hint="Awarded when assigned to an event.">
                <TextInput type="number" min={0} value={form.default_points} onChange={(e) => setForm({ ...form, default_points: e.target.value })} />
              </Field>
            </div>
            <Toggle checked={form.award_points} onChange={(v) => setForm({ ...form, award_points: v })} label="Award points automatically" />
            <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Role is active" />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                <Save size={15} /> {editing ? 'Save' : 'Create'}
              </Button>
              {editing && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(null)
                    setForm({ ...empty })
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </div>

        <div className="lg:col-span-3">
          <div className="card overflow-hidden">
            {roles.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">No roles yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {roles.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{r.name}</p>
                        {!r.is_active && <Badge tone="slate">inactive</Badge>}
                        {r.award_points && <Badge tone="green">+{r.default_points} pts</Badge>}
                      </div>
                      <p className="text-xs text-slate-400">
                        {r.category} • order {r.display_order}
                        {r.description ? ` • ${r.description}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-primary-600" onClick={() => startEdit(r)}>
                        <Pencil size={15} />
                      </button>
                      <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => remove(r)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
