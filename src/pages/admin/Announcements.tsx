import { useEffect, useState, type FormEvent } from 'react'
import { Megaphone, Pencil, Pin, Plus, Save, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Field, PageHeader, PageLoader, SelectInput, TextArea, TextInput, Toggle } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Announcement, Event } from '@/lib/types'
import { errorMessage, formatDateTime } from '@/lib/utils'

const empty = { title: '', body: '', audience: 'all' as 'all' | 'members' | 'admins', event_id: '', pinned: false, expires_at: '' }

export default function Announcements() {
  const { user } = useAuth()
  const [items, setItems] = useState<Announcement[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [{ data: annData }, { data: eventData }] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('events').select('id, title'),
    ])
    setItems((annData ?? []) as Announcement[])
    setEvents((eventData ?? []) as Event[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const startEdit = (a: Announcement) => {
    setEditing(a.id)
    setForm({
      title: a.title,
      body: a.body ?? '',
      audience: a.audience,
      event_id: a.event_id ?? '',
      pinned: a.pinned,
      expires_at: a.expires_at ? a.expires_at.slice(0, 16) : '',
    })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      title: form.title,
      body: form.body || null,
      audience: form.audience,
      event_id: form.event_id || null,
      pinned: form.pinned,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      created_by: user?.id ?? null,
    }
    let err: unknown
    if (editing) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', editing)
      err = error
    } else {
      const { error } = await supabase.from('announcements').insert(payload)
      err = error
    }
    setBusy(false)
    if (err) {
      setError(errorMessage(err))
      return
    }
    setEditing(null)
    setForm({ ...empty })
    load()
  }

  const remove = async (a: Announcement) => {
    if (!window.confirm('Delete this announcement?')) return
    await supabase.from('announcements').delete().eq('id', a.id)
    load()
  }

  if (loading) return <PageLoader />

  return (
    <div className="max-w-4xl">
      <PageHeader title="Announcements" subtitle="Broadcast messages to everyone, members only, or admins only." />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card h-fit p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            {editing ? <Pencil size={16} /> : <Plus size={16} />} {editing ? 'Edit announcement' : 'New announcement'}
          </h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Title">
              <TextInput required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Registration open for Hackathon" />
            </Field>
            <Field label="Message">
              <TextArea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </Field>
            <Field label="Audience">
              <SelectInput value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as typeof form.audience })}>
                <option value="all">Everyone</option>
                <option value="members">Members only</option>
                <option value="admins">Admins only</option>
              </SelectInput>
            </Field>
            <Field label="Linked event (optional)">
              <SelectInput value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
                <option value="">None</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Expires at (optional)">
              <TextInput type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </Field>
            <Toggle checked={form.pinned} onChange={(v) => setForm({ ...form, pinned: v })} label="Pin to top" />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                <Save size={15} /> {editing ? 'Save' : 'Publish'}
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
          {items.length === 0 ? (
            <EmptyState icon={<Megaphone size={40} />} title="No announcements yet" />
          ) : (
            <div className="space-y-3">
              {items.map((a) => (
                <div key={a.id} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-bold text-slate-900">
                      {a.pinned && <Pin size={14} className="text-primary-600" />}
                      {a.title}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge tone={a.audience === 'admins' ? 'primary' : a.audience === 'members' ? 'amber' : 'slate'}>{a.audience}</Badge>
                      <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary-600" onClick={() => startEdit(a)}>
                        <Pencil size={14} />
                      </button>
                      <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => remove(a)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {a.body && <p className="mt-1 text-sm text-slate-600">{a.body}</p>}
                  <p className="mt-2 text-xs text-slate-400">
                    {formatDateTime(a.created_at)}
                    {a.expires_at ? ` • expires ${formatDateTime(a.expires_at)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
