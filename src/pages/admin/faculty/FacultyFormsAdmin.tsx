import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, FileInput, Plus } from 'lucide-react'
import { Badge, EmptyState, PageHeader, PageLoader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/queries'
import type { FacultyForm } from '@/lib/types'

const STATUS_TONES: Record<string, 'green' | 'slate' | 'amber'> = {
  published: 'green',
  draft: 'amber',
  closed: 'slate',
}

export default function FacultyFormsAdmin() {
  const [forms, setForms] = useState<FacultyForm[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      const [formsData, subRows] = await Promise.all([
        supabase.from('faculty_forms').select('*').order('created_at', { ascending: false }),
        fetchAllRows<{ form_id: string }>('faculty_form_submissions', 'form_id'),
      ])
      if (!active) return
      setForms((formsData.data ?? []) as FacultyForm[])
      const map: Record<string, number> = {}
      for (const s of subRows) map[s.form_id] = (map[s.form_id] ?? 0) + 1
      setCounts(map)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Forms for Faculty"
        subtitle="Create forms that faculty must fill. Every faculty member sees published forms in their panel."
        actions={
          <Link to="/admin/faculty-forms/new" className="btn-primary">
            <Plus size={16} /> New form
          </Link>
        }
      />

      {forms.length === 0 ? (
        <EmptyState icon={<FileInput size={40} />} title="No forms yet" subtitle="Create your first faculty form." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Form</th>
                <th className="px-5 py-3">Questions</th>
                <th className="px-5 py-3">Submissions</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {forms.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900">{f.title}</p>
                    {f.description && <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">{f.description}</p>}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{(f.fields ?? []).length}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <ClipboardList size={14} /> {counts[f.id] ?? 0}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONES[f.status] ?? 'slate'}>{f.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link to={`/admin/faculty-forms/submissions?form=${f.id}`} className="btn-ghost !px-2.5 !py-1">
                        Submissions
                      </Link>
                      <Link to={`/admin/faculty-forms/${f.id}/edit`} className="btn-secondary !px-2.5 !py-1">
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
