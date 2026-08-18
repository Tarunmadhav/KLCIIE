import { useEffect, useState } from 'react'
import { Rocket, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { Avatar, EmptyState, PageHeader, PageLoader } from '@/components/ui'
import StartupForm from '@/components/startups/StartupForm'
import { supabase } from '@/lib/supabase'
import type { Startup } from '@/lib/types'
import { errorMessage } from '@/lib/utils'

const FETCH_FIELDS = 'id, name, website_url, logo_url, banner_url, contact_email, location, social_links, display_order, created_at, updated_at'

async function fetchRows(): Promise<Startup[]> {
  const { data, error } = await supabase
    .from('startups')
    .select(FETCH_FIELDS)
    .order('display_order')
    .order('name')
  if (error) throw error
  return (data ?? []) as Startup[]
}

export default function StartupsAdmin() {
  const [rows, setRows] = useState<Startup[]>([])
  const [editing, setEditing] = useState<Startup | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    const loaded = await fetchRows()
    setRows(loaded)
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

  const remove = async (s: Startup) => {
    if (!window.confirm(`Delete "${s.name || 'this startup'}" from the showcase?`)) return
    setDeleting(s.id)
    setError('')
    const { data, error: err } = await supabase.rpc('admin_delete_startup', { p_id: s.id })
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
    if (editing?.id === s.id) setEditing(null)
    await load()
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-6">
      <PageHeader title="Startups" subtitle="Showcase startups launched through CIIE on the public Our Startups page." />

      <div className="card p-6">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
          <Rocket size={16} className="text-primary-600" />
          {editing ? `Edit ${editing.name || 'startup'}` : 'New startup'}
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          All fields except name are optional. When you click "{editing ? 'Save changes' : 'Add startup'}", the card appears on the public /startups page.
        </p>
        {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <StartupForm
          key={editing?.id ?? 'new'}
          initial={editing}
          submitLabel={editing ? 'Save changes' : 'Add startup'}
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

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
          Added startups ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <EmptyState icon={<Rocket size={40} />} title="No startups yet" subtitle="Add your first startup above." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((s) => (
              <div key={s.id} className="card flex items-center gap-3 p-3">
                <Avatar name={s.name || 'Startup'} src={s.logo_url} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{s.name || '—'}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[s.location, s.website_url ? 'Has website' : null].filter(Boolean).join(' • ') || 'No details yet'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {s.website_url && (
                    <a
                      href={s.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-primary-600"
                      title="Visit website"
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                  <button
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-primary-600"
                    title="Edit"
                    onClick={() => {
                      setError('')
                      setEditing(s)
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                    disabled={deleting === s.id}
                    onClick={() => void remove(s)}
                  >
                    {deleting === s.id ? <span className="text-xs">…</span> : <Trash2 size={15} />}
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
