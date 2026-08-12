import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Github, Globe, Linkedin, Mail, Send, Users } from 'lucide-react'
import { Avatar, EmptyState, PageLoader } from '@/components/ui'
import { supabase } from '@/lib/supabase'

interface PublicMember {
  id: string
  full_name: string | null
  ciie_id: string | null
  student_id: string | null
  department: string | null
  year_of_study: string | null
  team: string | null
  domain: string | null
  bio: string | null
  avatar_url: string | null
  social_links: Record<string, string>
  phone: string | null
}

const socialHref = (u: string, base: string) => {
  if (/^https?:\/\//i.test(u)) return u
  return base + u.replace(/^@/, '')
}

export default function MemberPublic() {
  const { id } = useParams<{ id: string }>()
  const [member, setMember] = useState<PublicMember | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let active = true
    const load = async () => {
      const { data: profileData } = await supabase.rpc('get_public_member', { p_member_id: id })
      const { data: studentRow } = await supabase
        .from('profiles')
        .select('student_id')
        .eq('id', id)
        .maybeSingle()
      if (active) {
        const p = (profileData as PublicMember | null) ?? null
        if (p) {
          p.student_id = ((studentRow as { student_id: string | null } | null)?.student_id) ?? null
        }
        setMember(p)
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [id])

  if (loading) return <PageLoader />
  if (!member) {
    return (
      <div className="container-page py-20">
        <EmptyState icon={<Users size={40} />} title="Member profile is private" subtitle="This member has chosen not to show their profile publicly." />
      </div>
    )
  }

  const social = member.social_links ?? {}

  const details: Array<{ label: string; value: string }> = [
    { label: 'Student Id', value: member.student_id ?? '' },
    { label: 'CIIE ID', value: member.ciie_id ?? '' },
    ...(member.domain ? [{ label: 'Domain', value: member.domain }] : []),
    ...(member.team ? [{ label: 'Position', value: member.team }] : []),
    ...(member.department ? [{ label: 'Department', value: member.department }] : []),
    ...(member.year_of_study ? [{ label: 'Year of study', value: member.year_of_study }] : []),
    ...(member.phone ? [{ label: 'Phone', value: member.phone }] : []),
  ].filter((d) => d.value.trim() !== '')

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="card overflow-hidden">
        <div className="h-28 bg-gradient-to-br from-primary-600 to-primary-900" />
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <Avatar name={member.full_name} src={member.avatar_url} className="h-20 w-20 rounded-2xl ring-4 ring-white" />
            <div className="flex-1">
              <h1 className="text-2xl font-black text-slate-900">{member.full_name}</h1>
              {member.student_id && (
                <p className="mt-0.5 text-sm text-slate-500">
                  Student Id: <span className="font-mono font-semibold text-slate-700">{member.student_id}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {details.length > 0 && (
        <section className="card mt-6 p-6">
          <h2 className="text-lg font-bold text-slate-900">Details</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {details.map((d) => (
              <div key={d.label} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{d.label}</dt>
                <dd className="text-sm font-medium text-slate-800">{d.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {member.bio && (
        <section className="card mt-6 p-6">
          <h2 className="text-lg font-bold text-slate-900">About</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{member.bio}</p>
        </section>
      )}

      {(social.github || social.linkedin || social.portfolio || social.twitter || social.telegram || social.email) && (
        <section className="card mt-6 flex items-center gap-3 p-6">
          <h2 className="mr-2 text-sm font-bold text-slate-900">Social Links</h2>
          {social.linkedin && (
            <a href={socialHref(social.linkedin, 'https://linkedin.com/in/')} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-primary-600">
              <Linkedin size={18} />
            </a>
          )}
          {social.github && (
            <a href={socialHref(social.github, 'https://github.com/')} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-primary-600">
              <Github size={18} />
            </a>
          )}
          {social.telegram && (
            <a href={socialHref(social.telegram, 'https://t.me/')} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-primary-600">
              <Send size={18} />
            </a>
          )}
          {social.portfolio && (
            <a href={socialHref(social.portfolio, '')} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-primary-600">
              <Globe size={18} />
            </a>
          )}
          {social.email && (
            <a href={`mailto:${social.email}`} className="text-slate-500 hover:text-primary-600">
              <Mail size={18} />
            </a>
          )}
        </section>
      )}
    </div>
  )
}
