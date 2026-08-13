import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Github, Linkedin, Mail, Search, Send, Users } from 'lucide-react'
import { Avatar, Badge, EmptyState, PageHeader, PageLoader, TextInput } from '@/components/ui'
import AmtpsShowcase from '@/components/amtps/AmtpsShowcase'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

interface PublicMember extends Pick<Profile, 'id' | 'full_name' | 'ciie_id' | 'department' | 'year_of_study' | 'team' | 'avatar_url' | 'bio'> {
  role?: string | null
  domain?: string | null
  social_links?: Record<string, string>
}

const socialHref = (u: string, base: string) => {
  if (/^https?:\/\//i.test(u)) return u
  return base + u.replace(/^@/, '')
}

export default function MembersList() {
  const [members, setMembers] = useState<PublicMember[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, ciie_id, department, year_of_study, team, domain, role, avatar_url, bio, social_links')
        .eq('is_listed_member', true)
        .order('full_name')
        .limit(200)
      if (active) {
        if (!error) setMembers((data ?? []) as PublicMember[])
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
    if (!q) return members
    return members.filter((m) => (m.full_name ?? '').toLowerCase().includes(q) || (m.ciie_id ?? '').toLowerCase().includes(q))
  }, [members, query])

  return (
    <div className="container-page py-10">
      <PageHeader title="CIIE Members" subtitle="Discover the people driving innovation at CIIE." />

      <div className="relative mb-6 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <TextInput
          style={{ paddingLeft: '2.5rem' }}
          placeholder="Search by name or CIIE ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card flex items-center gap-4 p-4">
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-10">
            <AmtpsShowcase query={query} />
          </div>

          {filtered.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((m) => (
                <Link key={m.id} to={`/members/${m.id}`} className="card flex items-center gap-4 p-4 transition hover:shadow-md">
                  <Avatar name={m.full_name} src={m.avatar_url} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-bold text-slate-900">{m.full_name}</p>
                      {m.domain && m.role !== 'user' && <Badge tone="primary" className="shrink-0">{m.domain}</Badge>}
                    </div>
                    <p className="text-xs text-slate-400">{m.ciie_id}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[m.department, m.year_of_study].filter(Boolean).join(' • ') || 'CIIE Member'}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-slate-400">
                      {m.social_links?.telegram && (
                        <a href={socialHref(m.social_links.telegram, 'https://t.me/')} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Telegram">
                          <Send size={13} />
                        </a>
                      )}
                      {m.social_links?.github && (
                        <a href={socialHref(m.social_links.github, 'https://github.com/')} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="GitHub">
                          <Github size={13} />
                        </a>
                      )}
                      {m.social_links?.linkedin && (
                        <a href={socialHref(m.social_links.linkedin, 'https://linkedin.com/in/')} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="LinkedIn">
                          <Linkedin size={13} />
                        </a>
                      )}
                      {m.social_links?.email && (
                        <a href={`mailto:${m.social_links.email}`} onClick={(e) => e.stopPropagation()} title="Email">
                          <Mail size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : query ? (
            <EmptyState icon={<Users size={40} />} title="No members found" subtitle="Try a different search." />
          ) : null}
        </>
      )}
    </div>
  )
}
