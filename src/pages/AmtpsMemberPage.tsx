import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Github, Linkedin, Mail, Send, UserRound } from 'lucide-react'
import { Avatar, PageLoader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { socialHref } from '@/lib/utils'
import type { AmtpsMember } from '@/lib/types'

export default function AmtpsMemberPage() {
  const { id } = useParams<{ id: string }>()
  const [member, setMember] = useState<AmtpsMember | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!id) {
        setLoading(false)
        return
      }
      const { data, error } = await supabase
        .from('amtps_members')
        .select('id, full_name, email, student_id, department, year_of_study, position, domain, about, avatar_url, telegram, github, linkedin, contact_email, created_at, updated_at')
        .eq('id', id)
        .maybeSingle()
      if (active) {
        if (!error) setMember((data ?? null) as AmtpsMember | null)
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
      <div className="container-page py-20 text-center">
        <UserRound size={48} className="mx-auto mb-3 text-slate-300" />
        <h1 className="text-xl font-bold text-slate-900">Member not found</h1>
        <p className="mt-1 text-sm text-slate-500">This team card no longer exists.</p>
        <Link to="/amtps" className="btn-primary mt-5 inline-flex">
          <ArrowLeft size={16} /> Back to AMTPS
        </Link>
      </div>
    )
  }

  const details = [
    ['Student Id', member.student_id],
    ['Department', member.department],
    ['Year of study', member.year_of_study],
    ['Email', member.email],
    ['Public email', member.contact_email],
  ].filter(([, v]) => v) as [string, string][]

  return (
    <div className="container-page py-10">
      <Link to="/amtps" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-primary-600">
        <ArrowLeft size={16} /> Back to AMTPS Team
      </Link>

      <div className="card overflow-hidden">
        <div className="bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 px-6 py-10 text-center text-white sm:px-10">
          <Avatar name={member.full_name} src={member.avatar_url} className="mx-auto h-24 w-24 border-4 border-white/30 text-3xl" />
          <h1 className="mt-4 text-2xl font-extrabold">{member.full_name || 'AMTPS Member'}</h1>
          {member.position && <p className="mt-1 text-sm font-semibold text-primary-100">{member.position}</p>}
          {member.domain && <p className="mt-0.5 text-xs text-primary-200">{member.domain}</p>}
        </div>

        <div className="px-6 py-8 sm:px-10">
          {member.about && (
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-slate-600">{member.about}</p>
          )}

          {details.length > 0 && (
            <div className="mx-auto mt-6 max-w-xl">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                {details.map(([k, v], i) => (
                  <div key={k} className={`flex justify-between gap-4 px-4 py-3 text-sm ${i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
                    <span className="text-slate-500">{k}</span>
                    <span className="break-all text-right font-semibold text-slate-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(member.telegram || member.github || member.linkedin || member.email) && (
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {member.telegram && (
                <a href={socialHref(member.telegram, 'https://t.me/')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                  <Send size={15} /> Telegram
                </a>
              )}
              {member.github && (
                <a href={socialHref(member.github, 'https://github.com/')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                  <Github size={15} /> GitHub
                </a>
              )}
              {member.linkedin && (
                <a href={socialHref(member.linkedin, 'https://linkedin.com/in/')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                  <Linkedin size={15} /> LinkedIn
                </a>
              )}
              {member.email && (
                <a href={`mailto:${member.email}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
                  <Mail size={15} /> Email
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
