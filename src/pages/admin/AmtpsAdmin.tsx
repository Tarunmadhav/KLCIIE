import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ContactRound, Pencil, Trash2 } from 'lucide-react'
import { Avatar, Button, EmptyState, PageHeader, PageLoader } from '@/components/ui'
import AmtpsMemberForm from '@/components/amtps/AmtpsMemberForm'
import { useSettings } from '@/hooks/useSettings'
import { supabase } from '@/lib/supabase'
import type { AmtpsMember } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

const FETCH_FIELDS = 'id, full_name, email, student_id, department, year_of_study, position, domain, avatar_url, telegram, github, linkedin, contact_email, display_order, created_at, updated_at'

async function fetchRows(): Promise<AmtpsMember[]> {
  const { data, error } = await supabase
    .from('amtps_members')
    .select(FETCH_FIELDS)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as AmtpsMember[]
}

export default function AmtpsAdmin() {
  const [rows, setRows] = useState<AmtpsMember[]>([])
  const [editing, setEditing] = useState<AmtpsMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [togglingMode, setTogglingMode] = useState(false)
  const [error, setError] = useState('')
  const settings = useSettings()
  const navigate = useNavigate()
  const [mode, setMode] = useState(settings.amtps_mode)

  useEffect(() => {
    setMode(settings.amtps_mode)
  }, [settings.amtps_mode])

  const popupMode = mode

  const load = async () => {
    const loaded = await fetchRows()
    setRows(loaded)
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    load().catch((e) => {
      if (active) {
        setError(errorMessage(e))
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  const remove = async (m: AmtpsMember) => {
    if (!window.confirm(`Delete "${m.full_name || m.student_id || 'this card'}" from AMTPS? It will also be removed from the public /members page.`)) return
    setDeleting(m.id)
    setError('')
    const { data, error: err } = await supabase.rpc('admin_delete_amtps_member', { p_id: m.id })
    setDeleting(null)
    if (err) {
      setError(errorMessage(err))
      return
    }
    const res = (data ?? {}) as { ok?: boolean; error?: string }
    if (res.error) {
      setError(res.error)
      return
    }
    if (editing?.id === m.id) setEditing(null)
    await load()
  }

  const toggleMode = async () => {
    const next = !mode
    setTogglingMode(true)
    setError('')
    const { error: upErr } = await supabase.from('platform_settings').update({ amtps_mode: next }).eq('id', 1)
    setTogglingMode(false)
    if (upErr) {
      setError(errorMessage(upErr))
      return
    }
    setMode(next)
    if (!next) navigate('/amtps')
  }

  // Move a card up/down in the public lineup and persist the swap.
  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= rows.length) return
    setError('')
    const a = rows[index]
    const b = rows[target]
    const orderA = b.display_order ?? target
    const orderB = a.display_order ?? index
    setRows((prev) => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    const [errA, errB] = await Promise.all([
      supabase.from('amtps_members').update({ display_order: orderA }).eq('id', a.id).then((r) => r.error),
      supabase.from('amtps_members').update({ display_order: orderB }).eq('id', b.id).then((r) => r.error),
    ])
    if (errA || errB) {
      setError(errorMessage(errA ?? errB))
      await load()
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-6">
      <PageHeader title="AMTPS" subtitle="Showcase your team on the public Members page — square cards with photo, student ID and position. No login account is created." />

      <div className="card p-6">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
          <ContactRound size={16} className="text-primary-600" />
          {editing ? `Edit ${editing.full_name || 'member'}` : 'New member'}
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          All fields are optional. When you click "{editing ? 'Save changes' : 'Add member'}", the card appears on the public AMTPS showcase.
        </p>
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <AmtpsMemberForm
          key={editing?.id ?? 'new'}
          initial={editing}
          submitLabel={editing ? 'Save changes' : 'Add member'}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
        {editing && (
          <button
            className="mt-3 text-sm font-semibold text-slate-500 hover:underline"
            onClick={() => setEditing(null)}
          >
            Cancel edit
          </button>
        )}
      </div>

      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-900">Display mode</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {popupMode
              ? 'Popup — on the AMTPS page, clicking a card opens the details in a popup.'
              : 'New page — each team card opens on its own full page (/amtps/:id).'}
          </p>
        </div>
        <Button variant="secondary" disabled={togglingMode} onClick={() => void toggleMode()} className="shrink-0">
          {togglingMode ? 'Switching…' : popupMode ? 'Switch to new page' : 'Switch to popup'}
        </Button>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
          Added members ({rows.length}) — use ↑ / ↓ to set the display order on the Members page
        </h2>
        {rows.length === 0 ? (
          <EmptyState icon={<ContactRound size={40} />} title="No AMTPS members yet" subtitle="Add your first team card above." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((m, i) => (
              <div key={m.id} className="card flex items-center gap-3 p-3">
                <Avatar name={m.full_name || 'AMTPS'} src={m.avatar_url} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{m.full_name || '—'}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[m.student_id, m.position].filter(Boolean).join(' • ') || 'No details yet'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-0.5">
                  <button
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary-600 disabled:opacity-30"
                    title="Move up — appears earlier on the Members page"
                    disabled={i === 0}
                    onClick={() => void move(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <span className="text-[10px] font-bold text-slate-300">{i + 1}</span>
                  <button
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary-600 disabled:opacity-30"
                    title="Move down — appears later on the Members page"
                    disabled={i === rows.length - 1}
                    onClick={() => void move(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-primary-600"
                    title="Edit"
                    onClick={() => {
                      setError('')
                      setEditing(m)
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                    disabled={deleting === m.id}
                    onClick={() => void remove(m)}
                  >
                    {deleting === m.id ? <span className="text-xs">…</span> : <Trash2 size={15} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
