import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Github, Linkedin, Mail, Send, UserRound } from 'lucide-react'
import { Avatar, EmptyState, Modal } from '@/components/ui'
import Reveal from '@/components/Reveal'
import { useSettings } from '@/hooks/useSettings'
import { supabase } from '@/lib/supabase'
import type { AmtpsMember } from '@/lib/types'

const socialHref = (u: string, base: string) => {
  if (/^https?:\/\//i.test(u)) return u
  return base + u.replace(/^@/, '')
}

const FETCH_FIELDS = 'id, full_name, email, student_id, department, year_of_study, position, domain, about, avatar_url, telegram, github, linkedin, contact_email, created_at, updated_at'

export default function AmtpsShowcase({ query = '' }: { query?: string }) {
  const [rows, setRows] = useState<AmtpsMember[]>([])
  const [selected, setSelected] = useState<AmtpsMember | null>(null)
  const [loading, setLoading] = useState(true)
  const settings = useSettings()
  const popupMode = settings.amtps_mode

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data, error } = await supabase
        .from('amtps_members')
        .select(FETCH_FIELDS)
        .order('full_name')
        .order('created_at', { ascending: true })
      if (active) {
        if (!error) setRows((data ?? []) as AmtpsMember[])
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((m) =>
      [m.full_name, m.student_id, m.position, m.domain, m.department, m.about].some((v) =>
        (v ?? '').toLowerCase().includes(q),
      ),
    )
  }, [rows, query])

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="aspect-square animate-pulse bg-slate-100" />
          </div>
        ))}
      </div>
    )
  }

  if (rows.length === 0 && !query) {
    return (
      <EmptyState
        icon={<UserRound size={40} />}
        title="No AMTPS members yet"
        subtitle="The team will appear here once a super admin adds them."
      />
    )
  }

  if (filtered.length === 0) return null

  const card = (m: AmtpsMember, content: React.ReactNode) =>
    popupMode ? (
      <button key={m.id} onClick={() => setSelected(m)} className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        {content}
      </button>
    ) : (
      <Link key={m.id} to={`/amtps/${m.id}`} className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        {content}
      </Link>
    )

  return (
    <>
      <Reveal variant="zoom">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((m) =>
          card(
            m,
            <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
              {m.avatar_url ? (
                <img src={m.avatar_url} alt={m.full_name || 'AMTPS member'} className="h-full w-full object-cover transition group-hover:scale-105" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-primary-300">
                  <UserRound size={44} />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/80 to-transparent px-3 pb-2 pt-6 text-white">
                {m.full_name && <p className="truncate text-sm font-bold">{m.full_name}</p>}
                <p className="truncate text-[11px] text-slate-200">
                  {[m.student_id, m.position].filter(Boolean).join(' • ')}
                </p>
              </div>
            </div>,
          ),
        )}
        </div>
      </Reveal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.full_name || 'Team member'}>
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center">
              <Avatar name={selected.full_name} src={selected.avatar_url} className="h-20 w-20 text-2xl" />
              {selected.position && <p className="mt-2 text-sm font-semibold text-primary-600">{selected.position}</p>}
              {selected.domain && <p className="text-sm text-slate-500">{selected.domain}</p>}
            </div>
            {selected.about && <p className="text-sm leading-relaxed text-slate-600">{selected.about}</p>}
            <dl className="space-y-2">
              {[
                ['Student Id', selected.student_id],
                ['Department', selected.department],
                ['Year of study', selected.year_of_study],
                ['Email', selected.email],
                ['Public email', selected.contact_email],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1.5 text-sm">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="break-all text-right font-medium text-slate-800">{v}</dd>
                  </div>
                ))}
            </dl>
            {(selected.telegram || selected.github || selected.linkedin || selected.email) && (
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {selected.telegram && (
                  <a href={socialHref(selected.telegram, 'https://t.me/')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                    <Send size={14} /> Telegram
                  </a>
                )}
                {selected.github && (
                  <a href={socialHref(selected.github, 'https://github.com/')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                    <Github size={14} /> GitHub
                  </a>
                )}
                {selected.linkedin && (
                  <a href={socialHref(selected.linkedin, 'https://linkedin.com/in/')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                    <Linkedin size={14} /> LinkedIn
                  </a>
                )}
                {selected.email && (
                  <a href={`mailto:${selected.email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
                    <Mail size={14} /> Email
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
