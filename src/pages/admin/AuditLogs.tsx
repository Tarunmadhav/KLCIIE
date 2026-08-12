import { useEffect, useMemo, useState } from 'react'
import { Download, ScrollText, Search } from 'lucide-react'
import { Avatar, EmptyState, PageHeader, PageLoader, SelectInput, TextInput } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { AuditLog, Profile } from '@/lib/types'
import { downloadTextFile, formatDateTime } from '@/lib/utils'

interface LogRow extends AuditLog {
  actor?: Pick<Profile, 'id' | 'full_name' | 'email'> | null
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [actors, setActors] = useState<Record<string, Pick<Profile, 'full_name' | 'email'>>>({})
  const [q, setQ] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data } = await supabase.rpc('get_audit_logs', { p_limit: 300 })
      const rows = (data ?? []) as AuditLog[]
      const ids = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean))) as string[]
      const actorMap: Record<string, Pick<Profile, 'full_name' | 'email'>> = {}
      if (ids.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
        for (const p of (profiles ?? []) as Array<Profile & { id: string }>) actorMap[p.id] = { full_name: p.full_name, email: p.email }
      }
      if (active) {
        setLogs(rows)
        setActors(actorMap)
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return logs.filter((l) => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false
      if (!query) return true
      return `${l.action} ${l.entity_type ?? ''} ${l.entity_id ?? ''} ${actors[l.actor_id ?? '']?.full_name ?? ''} ${l.details ? JSON.stringify(l.details) : ''}`
        .toLowerCase()
        .includes(query)
    })
  }, [logs, q, actionFilter, actors])

  const exportCsv = () => {
    const rows = filtered.map((l) => ({
      Time: formatDateTime(l.created_at),
      Actor: actors[l.actor_id ?? '']?.full_name ?? l.actor_id ?? 'system',
      Email: actors[l.actor_id ?? '']?.email ?? '',
      Action: l.action,
      Entity: l.entity_type ?? '',
      'Entity ID': l.entity_id ?? '',
      Details: l.details ? JSON.stringify(l.details) : '',
      IP: l.ip ?? '',
    }))
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const keys = Object.keys(rows[0])
    const data = rows.map((r) => keys.map((k) => esc((r as Record<string, unknown>)[k])).join(','))
    downloadTextFile('ciie-audit-log.csv', [keys.join(','), ...data].join('\n'), 'text/csv')
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Every admin action, MFA event and failed login. Append-only; only functions can write."
        actions={
          <button className="btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={15} /> Export CSV
          </button>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <TextInput className="!pl-9" placeholder="Search logs…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <SelectInput value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectInput>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<ScrollText size={40} />} title="No log entries match" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Actor</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Entity</th>
                <th className="px-5 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDateTime(l.created_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={actors[l.actor_id ?? '']?.full_name} className="h-7 w-7 text-[10px]" />
                      <div>
                        <p className="font-semibold text-slate-900">{actors[l.actor_id ?? '']?.full_name ?? 'System'}</p>
                        <p className="text-xs text-slate-400">{actors[l.actor_id ?? '']?.email ?? l.actor_id ?? ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 font-medium text-slate-800">{l.action}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {l.entity_type ?? '—'}
                    {l.entity_id && <p className="font-mono text-[10px]">{l.entity_id}</p>}
                  </td>
                  <td className="max-w-xs truncate px-5 py-3 text-xs text-slate-500">{l.details ? JSON.stringify(l.details) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
