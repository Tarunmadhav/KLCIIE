import { useEffect, useState } from 'react'
import { ClipboardList, FileText, MapPin } from 'lucide-react'
import { Badge, EmptyState, PageHeader, PageLoader } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { DutyAssignment } from '@/lib/types'
import { formatDate } from '@/lib/utils'

const STATUS_TONE: Record<string, 'slate' | 'primary' | 'green' | 'red'> = {
  assigned: 'primary',
  in_progress: 'primary',
  completed: 'green',
  absent: 'red',
}

const STATUS_LABEL: Record<string, string> = {
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  absent: 'Absent',
}

interface FileLink {
  id: string
  duty_id: string
  name: string
  url: string
}

export default function MemberDuties() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState<DutyAssignment[]>([])
  const [files, setFiles] = useState<FileLink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    let active = true
    const load = async () => {
      const { data } = await supabase
        .from('duty_assignments')
        .select('*, duty:duties(id, title, description, duty_date, location)')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })
      if (!active) return
      setAssignments((data ?? []) as DutyAssignment[])

      const dutyIds = (data ?? []).map((d) => d.duty_id)
      const fileRows: FileLink[] = []
      if (dutyIds.length > 0) {
        const { data: fileData } = await supabase
          .from('duty_files')
          .select('id, duty_id, name, path')
          .in('duty_id', dutyIds)
        for (const f of fileData ?? []) {
          const { data: signed } = await supabase.storage
            .from('duties')
            .createSignedUrl(f.path, 3600)
          fileRows.push({ id: f.id, duty_id: f.duty_id, name: f.name, url: signed?.signedUrl ?? '' })
        }
      }
      if (active) {
        setFiles(fileRows)
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [user])

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Assigned Work"
        subtitle="CIIE work assigned to you, including any attached files."
        actions={<ClipboardList className="text-primary-500" size={28} />}
      />

      {assignments.length === 0 ? (
        <EmptyState icon={<ClipboardList size={40} />} title="No assigned work yet" subtitle="When the admin assigns you work it will appear here." />
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => (
            <div key={a.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-slate-900">{a.duty?.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    {a.duty?.duty_date && <span>{formatDate(a.duty.duty_date)}</span>}
                    {a.duty?.location && (
                      <span className="flex items-center gap-1">
                        <MapPin size={12} /> {a.duty.location}
                      </span>
                    )}
                    <span>Assigned {formatDate(a.created_at)}</span>
                  </p>
                  {a.duty?.description && <p className="mt-2 text-sm text-slate-600">{a.duty.description}</p>}
                </div>
                <Badge tone={STATUS_TONE[a.status] ?? 'slate'}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
              </div>

              {files.filter((f) => f.duty_id === a.duty_id).length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Files</p>
                  {files
                    .filter((f) => f.duty_id === a.duty_id)
                    .map((f) => (
                      <a
                        key={f.id}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-primary-700 transition hover:border-primary-300 hover:bg-primary-50"
                      >
                        <FileText size={15} />
                        {f.name}
                      </a>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
