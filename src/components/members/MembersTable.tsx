import { Link } from 'react-router-dom'
import { Github, Linkedin, Mail, Phone, Send, Trash2 } from 'lucide-react'
import { Avatar, Badge } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ROLE_LABELS, isAdminRole, type Profile } from '@/lib/types'
import { formatDate } from '@/lib/utils'

export interface MemberRow extends Profile {
  total_points?: number
  events_worked?: number
  events_attended?: number
  achievements?: number
  certificates?: number
}

export interface MemberStats {
  member_id: string
  total_points: number
  events_worked: number
  events_attended: number
  achievements: number
  certificates: number
}

const socialHref = (u: string | null | undefined, base: string) => {
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  return base + u.replace(/^@/, '')
}

export function fetchMemberRows(listedOnly = false): Promise<MemberRow[]> {
  let query = supabase.from('profiles').select('*').order('full_name')
  if (listedOnly) query = query.eq('is_listed_member', true)
  return Promise.all([query, supabase.from('v_member_stats').select('*')]).then(([profiles, stats]) => {
    const statsMap = new Map<string, MemberStats>()
    for (const s of (stats.data ?? []) as MemberStats[]) statsMap.set(s.member_id, s)
    return ((profiles.data ?? []) as Profile[]).map((p) => ({ ...p, ...(statsMap.get(p.id) ?? {}) })) as MemberRow[]
  })
}

export default function MembersTable({ rows, onRemove }: { rows: MemberRow[]; onRemove?: (m: MemberRow) => void }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No listed members yet.</p>
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-5 py-3">Member</th>
            <th className="px-5 py-3">Student ID</th>
            <th className="px-5 py-3">Domain</th>
            <th className="px-5 py-3">Contact</th>
            <th className="px-5 py-3">Socials</th>
            <th className="px-5 py-3">Position / Dept</th>
            <th className="px-5 py-3">Role</th>
            <th className="px-5 py-3">Status</th>
            {onRemove && <th className="px-5 py-3 text-right">Remove</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((m) => (
            <tr key={m.id} className="hover:bg-slate-50">
              <td className="px-5 py-3">
                <Link to={`/admin/members/${m.id}`} className="flex items-center gap-3">
                  <Avatar name={m.full_name} src={m.avatar_url} className="h-8 w-8 text-xs" />
                  <div>
                    <p className="font-semibold text-slate-900 hover:text-primary-600">{m.full_name}</p>
                    <p className="text-xs text-slate-400">{m.ciie_id ?? m.email}</p>
                  </div>
                </Link>
              </td>
              <td className="px-5 py-3">
                <span className="font-mono text-xs text-slate-500">{m.student_id ?? '—'}</span>
              </td>
              <td className="px-5 py-3">
                {m.domain ? (
                  <Badge tone="primary">{m.domain}</Badge>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-5 py-3 text-slate-600">
                {m.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={13} className="text-slate-400" /> {m.phone}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={13} className="text-slate-400" /> {m.email ?? '—'}
                  </span>
                )}
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  {m.social_links?.telegram ? (
                    <a href={socialHref(m.social_links.telegram, 'https://t.me/')} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-primary-600" title="Telegram">
                      <Send size={15} />
                    </a>
                  ) : null}
                  {m.social_links?.github ? (
                    <a href={socialHref(m.social_links.github, 'https://github.com/')} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-primary-600" title="GitHub">
                      <Github size={15} />
                    </a>
                  ) : null}
                  {m.social_links?.linkedin ? (
                    <a href={socialHref(m.social_links.linkedin, 'https://linkedin.com/in/')} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-primary-600" title="LinkedIn">
                      <Linkedin size={15} />
                    </a>
                  ) : null}
                  {(m.social_links?.email ?? m.email) ? (
                    <a href={`mailto:${m.social_links?.email ?? m.email}`} className="text-slate-400 hover:text-primary-600" title="Email">
                      <Mail size={15} />
                    </a>
                  ) : null}
                  {!m.social_links?.telegram && !m.social_links?.github && !m.social_links?.linkedin ? (
                    <span className="text-slate-300">—</span>
                  ) : null}
                </div>
              </td>
              <td className="px-5 py-3 text-slate-600">
                {m.team ?? '—'}
                <p className="text-xs text-slate-400">{m.department ?? ''}</p>
              </td>
              <td className="px-5 py-3">
                <Badge tone={isAdminRole(m.role) ? 'primary' : 'slate'}>{ROLE_LABELS[m.role] ?? m.role}</Badge>
              </td>
              <td className="px-5 py-3">
                <Badge tone={m.status === 'active' ? 'green' : m.status === 'pending' ? 'amber' : m.status === 'recruit' ? 'primary' : 'red'}>{m.status}</Badge>
                <p className="mt-0.5 text-[10px] text-slate-400">Joined {formatDate(m.created_at)}</p>
              </td>
              {onRemove && (
                <td className="px-5 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(m)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 size={13} /> Remove
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
