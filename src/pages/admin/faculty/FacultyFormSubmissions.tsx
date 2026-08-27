import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ClipboardList, Download } from 'lucide-react'
import { EmptyState, PageHeader, PageLoader, SelectInput } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/queries'
import type { CustomFieldDef, FacultyForm, FacultyFormSubmission } from '@/lib/types'
import { downloadExcel } from '@/lib/excel'
import { formatDateTime } from '@/lib/utils'

interface SubmissionRow extends FacultyFormSubmission {
  member: { full_name: string | null; email: string | null; ciie_id: string | null; department: string | null } | null
}

export default function FacultyFormSubmissions() {
  const [searchParams] = useSearchParams()
  const [forms, setForms] = useState<FacultyForm[]>([])
  const [formId, setFormId] = useState('')
  const [rows, setRows] = useState<SubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rowsLoading, setRowsLoading] = useState(false)

  useEffect(() => {
    let active = true
    supabase
      .from('faculty_forms')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!active) return
        const list = (data ?? []) as FacultyForm[]
        setForms(list)
        setFormId((prev) => prev || searchParams.get('form') || list[0]?.id || '')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [searchParams])

  useEffect(() => {
    if (!formId) {
      setRows([])
      return
    }
    let active = true
    setRowsLoading(true)
    fetchAllRows<unknown>(
      'faculty_form_submissions',
      '*, member:profiles(full_name, email, ciie_id, department)',
      (q) => q.eq('form_id', formId).order('submitted_at', { ascending: false }),
    )
      .then((data) => {
        if (!active) return
        setRows(data as unknown as SubmissionRow[])
        setRowsLoading(false)
      })
      .catch(() => {
        if (!active) return
        setRows([])
        setRowsLoading(false)
      })
    return () => {
      active = false
    }
  }, [formId])

  const form = useMemo(() => forms.find((f) => f.id === formId) ?? null, [forms, formId])
  const fields = useMemo(() => (form?.fields ?? []) as CustomFieldDef[], [form])

  const exportExcel = async () => {
    if (!form) return
    const sheetRows = rows.map((r, i) => {
      const row: Record<string, unknown> = {
        'S.No': i + 1,
        Name: r.member?.full_name ?? '—',
        'CIIE ID': r.member?.ciie_id ?? '—',
        Email: r.member?.email ?? '—',
        Department: r.member?.department ?? '—',
      }
      for (const f of fields) {
        row[f.label] = r.responses?.[f.key] ?? ''
      }
      row['Submitted at'] = formatDateTime(r.submitted_at)
      row['Last updated'] = formatDateTime(r.updated_at)
      return row
    })
    await downloadExcel(
      `faculty-form-${form.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheetRows,
      'Submissions',
    )
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Faculty Forms Submitted"
        subtitle="Every submission by faculty members — who submitted, what they answered and exactly when."
        actions={
          rows.length > 0 ? (
            <button className="btn-primary" onClick={() => void exportExcel()}>
              <Download size={15} /> Download Excel
            </button>
          ) : undefined
        }
      />

      <div className="max-w-md">
        <SelectInput value={formId} onChange={(e) => setFormId(e.target.value)}>
          <option value="">Choose a form…</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </SelectInput>
      </div>

      {!formId ? (
        <div className="mt-6">
          <EmptyState icon={<ClipboardList size={40} />} title="No form selected" subtitle="Pick a form above to see its submissions." />
        </div>
      ) : rowsLoading ? (
        <p className="mt-6 text-sm text-slate-500">Loading submissions…</p>
      ) : rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<ClipboardList size={40} />} title="No submissions yet" subtitle="No faculty has filled this form so far." />
        </div>
      ) : (
        <div className="card mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">S.No</th>
                <th className="px-5 py-3">Faculty</th>
                <th className="px-5 py-3">CIIE ID</th>
                <th className="px-5 py-3">Email</th>
                {fields.map((f) => (
                  <th key={f.key} className="px-5 py-3">
                    {f.label}
                    {f.required && ' *'}
                  </th>
                ))}
                <th className="px-5 py-3">Submitted at</th>
                <th className="px-5 py-3">Last updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-400">{i + 1}</td>
                  <td className="px-5 py-3 font-semibold text-slate-900">{r.member?.full_name ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{r.member?.ciie_id ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{r.member?.email ?? '—'}</td>
                  {fields.map((f) => (
                    <td key={f.key} className="px-5 py-3 text-slate-600">
                      {r.responses?.[f.key] ?? '—'}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDateTime(r.submitted_at)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-400">{formatDateTime(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <p className="mt-4 text-xs text-slate-400">
          Form status: <span className="font-semibold uppercase">{form.status}</span> ·{' '}
          <Link to={`/admin/faculty-forms/${form.id}/edit`} className="font-medium text-primary-600 hover:underline">
            Edit form
          </Link>
        </p>
      )}
    </div>
  )
}

