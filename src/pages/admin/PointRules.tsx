import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { Badge, Button, Field, PageHeader, PageLoader, TextArea, TextInput, Toggle } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { PointRule } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

const empty = { name: '', activity_type: '', points: '0', category: '', description: '', is_automatic: false, is_active: true }

export default function PointRules() {
  const [rules, setRules] = useState<PointRule[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const { data } = await supabase.from('point_rules').select('*').order('points', { ascending: false })
    setRules((data ?? []) as PointRule[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const startEdit = (r: PointRule) => {
    setEditing(r.id)
    setForm({
      name: r.name,
      activity_type: r.activity_type,
      points: String(r.points),
      category: r.category ?? '',
      description: r.description ?? '',
      is_automatic: r.is_automatic,
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
      activity_type: form.activity_type.toLowerCase().replace(/\s+/g, '_'),
      points: Number(form.points),
      category: form.category || null,
      description: form.description || null,
      is_automatic: form.is_automatic,
      is_active: form.is_active,
    }
    if (!payload.activity_type || payload.points <= 0) {
      setError('Activity type is required and points must be positive.')
      setBusy(false)
      return
    }
    let err: unknown
    if (editing) {
      const { error } = await supabase.from('point_rules').update(payload).eq('id', editing)
      err = error
    } else {
      const { error } = await supabase.from('point_rules').insert(payload)
      err = error
    }
    setBusy(false)
    if (err) {
      setError(errorMessage(err))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: editing ? 'Point Rule Updated' : 'Point Rule Created', p_entity_type: 'point_rule', p_entity_id: editing ?? undefined })
    setEditing(null)
    setForm({ ...empty })
    load()
  }

  const remove = async (r: PointRule) => {
    if (!window.confirm(`Delete point rule "${r.name}"?`)) return
    const { error } = await supabase.from('point_rules').delete().eq('id', r.id)
    if (error) {
      alert(errorMessage(error))
      return
    }
    await supabase.rpc('log_admin_event', { p_action: 'Point Rule Deleted', p_entity_type: 'point_rule', p_entity_id: r.id })
    load()
  }

  if (loading) return <PageLoader />

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Point Rules"
        subtitle="Configurable rules drive automatic point awards (attendance, event work). They are never hardcoded in the app."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card h-fit p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            {editing ? <Pencil size={16} /> : <Plus size={16} />} {editing ? 'Edit rule' : 'New rule'}
          </h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Name">
              <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Event Attendance" />
            </Field>
            <Field label="Activity type" hint="Internal key, lowercase with underscores (e.g. event_attendance). Must be unique.">
              <TextInput required value={form.activity_type} onChange={(e) => setForm({ ...form, activity_type: e.target.value })} placeholder="event_attendance" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Points">
                <TextInput type="number" min={1} required value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
              </Field>
              <Field label="Category">
                <TextInput value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Attendance" />
              </Field>
            </div>
            <Field label="Description">
              <TextArea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Toggle checked={form.is_automatic} onChange={(v) => setForm({ ...form, is_automatic: v })} label="Awarded automatically by the system" />
            <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Rule is active" />
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
            {rules.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">No rules yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {rules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{r.name}</p>
                        {!r.is_active && <Badge tone="slate">inactive</Badge>}
                        <Badge tone={r.is_automatic ? 'primary' : 'amber'}>{r.is_automatic ? 'automatic' : 'manual'}</Badge>
                      </div>
                      <p className="text-xs text-slate-400">
                        <code className="text-slate-500">{r.activity_type}</code>
                        {r.category ? ` • ${r.category}` : ''}
                        {r.description ? ` • ${r.description}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="mr-1 font-extrabold text-primary-700">+{r.points}</span>
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
