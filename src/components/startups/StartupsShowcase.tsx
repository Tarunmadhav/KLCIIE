import { useEffect, useState } from 'react'
import { ExternalLink, Github, Linkedin, Mail, MapPin, Rocket, Twitter } from 'lucide-react'
import { EmptyState, Modal } from '@/components/ui'
import Reveal from '@/components/Reveal'
import { supabase } from '@/lib/supabase'
import type { Startup } from '@/lib/types'

const FETCH_FIELDS = 'id, name, website_url, logo_url, banner_url, contact_email, location, social_links, display_order, created_at, updated_at'

export default function StartupsShowcase() {
  const [rows, setRows] = useState<Startup[]>([])
  const [selected, setSelected] = useState<Startup | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data, error } = await supabase
        .from('startups')
        .select(FETCH_FIELDS)
        .order('display_order')
        .order('name')
      if (active) {
        if (!error) setRows((data ?? []) as Startup[])
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="h-52 animate-pulse bg-slate-100" />
            <div className="p-5 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Rocket size={40} />}
        title="No startups yet"
        subtitle="Startups will appear here once an admin adds them."
      />
    )
  }

  const socialIcon = (key: string) => {
    switch (key) {
      case 'twitter': return <Twitter size={14} />
      case 'linkedin': return <Linkedin size={14} />
      case 'github': return <Github size={14} />
      case 'instagram': return <ExternalLink size={14} />
      case 'facebook': return <ExternalLink size={14} />
      default: return <ExternalLink size={14} />
    }
  }

  return (
    <>
      <Reveal variant="zoom">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              {s.banner_url ? (
                <div className="relative h-52 overflow-hidden bg-slate-100">
                  <img src={s.banner_url} alt={s.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                  {s.logo_url && (
                    <img src={s.logo_url} alt={`${s.name} logo`} className="absolute bottom-3 left-3 h-14 w-14 rounded-xl border-2 border-white object-cover shadow-lg" />
                  )}
                </div>
              ) : s.logo_url ? (
                <div className="flex h-52 items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100">
                  <img src={s.logo_url} alt={`${s.name} logo`} className="h-24 w-24 rounded-2xl object-cover shadow-lg transition group-hover:scale-105" />
                </div>
              ) : (
                <div className="flex h-52 items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-primary-300">
                  <Rocket size={48} />
                </div>
              )}
              <div className="p-5">
                <h3 className="font-display text-lg font-bold text-slate-900 transition group-hover:text-primary-700">{s.name}</h3>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  {s.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} /> {s.location}
                    </span>
                  )}
                  {s.website_url && (
                    <a
                      href={s.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-primary-600 hover:underline"
                    >
                      <ExternalLink size={12} /> Website
                    </a>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Reveal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name || 'Startup'} wide>
        {selected && (
          <div className="space-y-4">
            {selected.banner_url && (
              <img
                src={selected.banner_url}
                alt={selected.name}
                className="h-80 w-full rounded-lg object-cover sm:h-96"
              />
            )}
            <div className="flex items-center gap-4">
              {selected.logo_url && <img src={selected.logo_url} alt={`${selected.name} logo`} className="h-16 w-16 rounded-xl object-cover shadow" />}
              <div>
                <h3 className="text-xl font-bold text-slate-900">{selected.name}</h3>
                {selected.location && <p className="flex items-center gap-1 text-sm text-slate-500"><MapPin size={14} /> {selected.location}</p>}
              </div>
            </div>
            {selected.social_links?.description && <p className="text-sm leading-relaxed text-slate-600">{selected.social_links.description}</p>}
            <dl className="space-y-2">
              {[
                ['Website', selected.website_url],
                ['Contact', selected.contact_email],
                ['Location', selected.location],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1.5 text-sm">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="break-all text-right font-medium text-slate-800">
                      {k === 'Website' ? (
                        <a href={v!} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">{v}</a>
                      ) : k === 'Contact' ? (
                        <a href={`mailto:${v}`} className="text-primary-600 hover:underline">{v}</a>
                      ) : v}
                    </dd>
                  </div>
                ))}
            </dl>
            {selected.social_links && Object.entries(selected.social_links).filter(([k, v]) => k !== 'description' && v).length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(selected.social_links)
                  .filter(([k, v]) => k !== 'description' && v)
                  .map(([key, url]) => (
                    <a
                      key={key}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 capitalize"
                    >
                      {socialIcon(key)} {key}
                    </a>
                  ))}
              </div>
            )}
            {selected.website_url && (
              <a
                href={selected.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-2 inline-flex items-center gap-2"
              >
                <ExternalLink size={15} /> Visit Website
              </a>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
