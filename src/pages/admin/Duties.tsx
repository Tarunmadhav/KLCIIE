import { useEffect, useState, type FormEvent } from 'react'
import { ClipboardList, FileText, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { Button, EmptyState, Field, PageHeader, PageLoader, SelectInput, TextInput } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Duty, DutyAssignment, DutyFile, Profile } from '@/lib/types'
import { errorMessage, formatDate } from '@/lib/utils'

const STATUS_OPTIONS = ['assigned', 'in_progress', 'completed', 'absent'] as const

export default function Duties() {
  const { user } = useAuth()
  const [duties, setDuties] = useState<Duty[]>([])
  const [assignments, setAssignments] = useState<DutyAssignment[]>([])
  const [files, setFiles] = useState<DutyFile[]>([])
  const [members, setMembers] = useState<Profile[]>([])
  const [editing, setEditing] = useState<Duty | null>(null)
  const [form, setForm] = useState({ title: '', description: '', duty_date: '', location: '' })
  const [newFiles, setNewFiles] = useState<FileList | null>(null)
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [{ data: dutyData }, { data: assignmentData }, { data: fileData }, { data: memberData }] = await Promise.all([
      supabase.from('duties').select('*').order('created_at', { ascending: false }),
      supabase.from('duty_assignments').select('*, duty:duties(id, title), member:profiles(id, full_name, ciie_id)'),
      supabase.from('duty_files').select('*'),
      supabase.from('profiles').select('id, full_name, ciie_id, department').eq('status', 'active').order('full_name'),
    ])
    setDuties((dutyData ?? []) as Duty[])
    setAssignments((assignmentData ?? []) as DutyAssignment[])
    setFiles((fileData ?? []) as DutyFile[])
    setMembers((memberData ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const startEdit = (d: Duty) => {
    setEditing(d)
    setForm({ title: d.title, description: d.description ?? '', duty_date: d.duty_date ?? '', location: d.location ?? '' })
    setSelectedMembers(assignments.filter((a) => a.duty_id === d.id).map((a) => a.member_id))
    setNewFiles(null)
  }

  const reset = () => {
    setEditing(null)
    setForm({ title: '', description: '', duty_date: '', location: '' })
    setSelectedMembers([])
    setNewFiles(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Title is required.')
      return
    }
    setBusy(true)
    setError('')
    const payload = {
      title: form.title,
      description: form.description || null,
      duty_date: form.duty_date || null,
      location: form.location || null,
      created_by: user?.id ?? null,
    }
    let dutyId = editing?.id
    let err: unknown
    if (editing) {
      const { error: upErr } = await supabase.from('duties').update(payload).eq('id', editing.id)
      err = upErr
    } else {
      const { data, error: insErr } = await supabase.from('duties').insert(payload).select('id').single()
      err = insErr
      dutyId = (data as { id: string } | null)?.id
    }

    if (err || !dutyId) {
      setBusy(false)
      setError(err ? errorMessage(err) : 'Could not save duty.')
      return
    }

    if (newFiles && newFiles.length > 0) {
      for (const file of Array.from(newFiles)) {
        const path = `duties/${dutyId}/${Date.now()}-${file.name}`
        const { error: upErr } = await supabase.storage.from('duties').upload(path, file, { upsert: true })
        if (!upErr) {
          await supabase.from('duty_files').insert({ duty_id: dutyId, name: file.name, path, size: file.size, content_type: file.type, uploaded_by: user?.id ?? null })
        }
      }
    }

    await supabase.from('duty_assignments').delete().eq('duty_id', dutyId)
    if (selectedMembers.length > 0) {
      const rows = selectedMembers.map((member_id) => ({ duty_id: dutyId, member_id, status: 'assigned' }))
      const { error: asgErr } = await supabase.from('duty_assignments').insert(rows)
      if (asgErr) setError(errorMessage(asgErr))
    }

    setBusy(false)
    reset()
    load()
  }

  const remove = async (d: Duty) => {
    if (!window.confirm(`Delete duty "${d.title}" and its assignments?`)) return
    await supabase.from('duties').delete().eq('id', d.id)
    load()
  }

  const removeFile = async (f: DutyFile) => {
    if (!window.confirm(`Remove file "${f.name}"?`)) return
    await supabase.storage.from('duties').remove([f.path])
    await supabase.from('duty_files').delete().eq('id', f.id)
    load()
  }

  const setStatus = async (assignmentId: string, status: string) => {
    const { error } = await supabase.from('duty_assignments').update({ status }).eq('id', assignmentId)
    if (error) alert(errorMessage(error))
    load()
  }

  const toggleMember = (id: string) =>
    setSelectedMembers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))

  if (loading) return <PageLoader />

  return (
    <div className="max-w-5xl">
      <PageHeader title="Duties" subtitle="Assign CIIE duties to members and attach private files (e.g. rosters, instructions)." />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card h-fit p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            {editing ? <Pencil size={16} /> : <Plus size={16} />} {editing ? 'Edit duty' : 'New duty'}
          </h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Title">
              <TextInput required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Registration desk" />
            </Field>
            <Field label="Description">
              <TextInput value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What the duty involves" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <TextInput type="date" value={form.duty_date} onChange={(e) => setForm({ ...form, duty_date: e.target.value })} />
              </Field>
              <Field label="Location">
                <TextInput value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Hall A" />
              </Field>
            </div>

            <Field label="Assign members">
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                {members.length === 0 && <p className="p-2 text-sm text-slate-400">No active members.</p>}
                {members.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition hover:bg-primary-50">
                    <input type="checkbox" checked={selectedMembers.includes(m.id)} onChange={() => toggleMember(m.id)} className="h-4 w-4 accent-primary-600" />
                    <span className="min-w-0 flex-1 truncate">{m.full_name}</span>
                    <span className="text-[10px] text-slate-400">{m.ciie_id}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Attach files" hint="Stored privately; only CIIE members can view them.">
              <input type="file" multiple className="block w-full text-sm" onChange={(e) => setNewFiles(e.target.files)} />
            </Field>

            {editing && files.filter((f) => f.duty_id === editing.id).length > 0 && (
              <div className="space-y-1.5">
                {files
                  .filter((f) => f.duty_id === editing.id)
                  .map((f) => (
                    <div key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <FileText size={14} className="text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => removeFile(f)} title="Remove file">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                <Save size={15} /> {editing ? 'Save' : 'Create'}
              </Button>
              {editing && (
                <Button variant="ghost" onClick={reset}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </div>

        <div className="lg:col-span-3">
          {duties.length === 0 ? (
            <EmptyState icon={<ClipboardList size={40} />} title="No duties yet" subtitle="Create your first duty on the left." />
          ) : (
            <div className="space-y-3">
              {duties.map((d) => {
                const dutyAssignments = assignments.filter((a) => a.duty_id === d.id)
                return (
                  <div key={d.id} className="card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-slate-900">{d.title}</p>
                      <div className="flex items-center gap-2">
                        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary-600" onClick={() => startEdit(d)}>
                          <Pencil size={14} />
                        </button>
                        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => remove(d)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {d.duty_date ? `${formatDate(d.duty_date)}` : 'No date'}
                      {d.location ? ` • ${d.location}` : ''} • {dutyAssignments.length} member{dutyAssignments.length === 1 ? '' : 's'}
                    </p>
                    {d.description && <p className="mt-1 text-sm text-slate-600">{d.description}</p>}

                    {dutyAssignments.length > 0 && (
                      <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {dutyAssignments.map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-800">{a.member?.full_name ?? 'Member'}</p>
                              <p className="text-[10px] text-slate-400">{a.member?.ciie_id}</p>
                            </div>
                            <SelectInput value={a.status} onChange={(e) => setStatus(a.id, e.target.value)} className="!w-auto !py-1 text-xs">
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s.replace('_', ' ')}
                                  </option>
                                ))}
                              </SelectInput>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
