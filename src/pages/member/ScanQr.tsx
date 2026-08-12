import { useEffect, useState } from 'react'
import { Camera, CalendarDays, ScanLine } from 'lucide-react'
import AttendanceScannerPanel from '@/components/AttendanceScannerPanel'
import { EmptyState, PageHeader, PageLoader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/types'
import { formatDate } from '@/lib/utils'

export default function ScanQr() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    let active = true
    supabase
      .from('events')
      .select('*')
      .eq('status', 'published')
      .order('start_date', { ascending: false })
      .then(({ data }) => {
        if (active) {
          setEvents((data ?? []) as Event[])
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) return <PageLoader />

  const selected = events.find((e) => e.id === selectedId)

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Scan QR"
        subtitle="Mark attendance for event attendees by scanning their QR codes. Points are awarded automatically."
        actions={<ScanLine className="text-primary-500" size={28} />}
      />

      {events.length === 0 ? (
        <EmptyState icon={<Camera size={40} />} title="No active events" subtitle="Published events will appear here for attendance scanning." />
      ) : !selected ? (
        <div className="grid gap-3">
          {events.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelectedId(e.id)}
              className="card flex items-center justify-between gap-3 p-4 text-left transition hover:border-primary-300 hover:shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-900">{e.title}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                  <CalendarDays size={12} /> {formatDate(e.start_date)}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-700">
                <Camera size={13} /> Scan
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <button onClick={() => setSelectedId('')} className="text-sm font-medium text-primary-600 hover:underline">
            ← Choose another event
          </button>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{selected.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(selected.start_date)} {selected.venue ? `• ${selected.venue}` : ''}
          </p>
          <AttendanceScannerPanel eventId={selectedId} />
        </div>
      )}
    </div>
  )
}
