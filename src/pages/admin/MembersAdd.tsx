import { useEffect, useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { EmptyState, PageHeader, PageLoader } from '@/components/ui'
import MemberAddForm from '@/components/members/MemberAddForm'
import MembersTable, { fetchMemberRows, type MemberRow } from '@/components/members/MembersTable'
import { supabase } from '@/lib/supabase'

export default function MembersAdd() {
  const [rows, setRows] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const loaded = await fetchMemberRows()
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

  const remove = async (m: MemberRow) => {
    if (!window.confirm(`Remove "${m.full_name ?? 'this member'}" from the public CIIE Members directory? Their profile is kept.`)) return
    const { error } = await supabase.from('profiles').update({ is_listed_member: false }).eq('id', m.id)
    if (error) {
      alert(error.message)
      return
    }
    await load()
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-6">
      <PageHeader title="Add member" subtitle="List a person in the CIIE Members directory — no login account is created." />

      <div className="card p-6">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
          <UserPlus size={16} className="text-primary-600" /> New member
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          Add their name, domain and social links so they appear in the CIIE Members directory. If they already have a login with the same email, their existing profile is updated instead.
        </p>
        <MemberAddForm onCreated={load} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
          All members ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <EmptyState icon={<Users size={40} />} title="No members yet" subtitle="Add your first member above." />
        ) : (
          <MembersTable rows={rows} onRemove={(m) => void remove(m)} />
        )}
      </section>
    </div>
  )
}
