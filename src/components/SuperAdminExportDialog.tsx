import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui'
import { downloadExcelSheets } from '@/lib/excel'

type RowFilter = 'ALL' | 'PRESENT' | 'ABSENT'

export interface SuperAdminExportRequest {
  filename: string
  sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>
}

export function SuperAdminExportDialog({ request, onClose }: { request: SuperAdminExportRequest | null; onClose: () => void }) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [rowFilter, setRowFilter] = useState<RowFilter>('ALL')
  const keys = useMemo(
    () => (request ? Array.from(new Set(request.sheets.flatMap((sheet) => sheet.rows.flatMap((row) => Object.keys(row))))) : []),
    [request],
  )

  useEffect(() => {
    setSelectedKeys(keys)
    setRowFilter('ALL')
  }, [keys])

  const toggleKey = (key: string) => {
    setSelectedKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
  }

  const exportSelected = () => {
    if (!request || selectedKeys.length === 0) return
    const sheets = request.sheets.map((sheet) => ({
      name: sheet.name,
      rows: sheet.rows
        .filter((row) => {
          if (rowFilter === 'ALL') return true
          const status = String(row['Final Attendance'] ?? row.Attendance ?? row.Status ?? row.status ?? '').toUpperCase()
          return rowFilter === 'PRESENT' ? status.includes('PRESENT') : status.includes('ABSENT')
        })
        .map((row) => Object.fromEntries(selectedKeys.map((key) => [key, row[key] ?? '']))),
    }))
    void downloadExcelSheets(request.filename, sheets)
    onClose()
  }

  return (
    <Modal open={!!request} onClose={onClose} title="Choose Excel export details" wide footer={
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">{selectedKeys.length} of {keys.length} columns selected</span>
        <button className="btn-primary" onClick={exportSelected} disabled={selectedKeys.length === 0}>Download Excel</button>
      </div>
    }>
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">Columns</p>
              <p className="text-xs text-slate-500">Select the fields you want in the spreadsheet.</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setSelectedKeys(keys)}>Select all</button>
              <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => setSelectedKeys([])}>Clear all</button>
            </div>
          </div>
          <div className="grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            {keys.map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-white">
                <input type="checkbox" checked={selectedKeys.includes(key)} onChange={() => toggleKey(key)} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
                <span>{key}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="font-semibold text-slate-900">Rows</p>
          <p className="mb-2 text-xs text-slate-500">Choose which records should be downloaded.</p>
          <div className="flex flex-wrap gap-2">
            {(['ALL', 'PRESENT', 'ABSENT'] as RowFilter[]).map((filter) => (
              <label key={filter} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${rowFilter === filter ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600'}`}>
                <input type="radio" name="super-admin-export-row-filter" checked={rowFilter === filter} onChange={() => setRowFilter(filter)} className="h-4 w-4 text-primary-600" />
                {filter === 'ALL' ? 'All rows' : filter === 'PRESENT' ? 'Present rows' : 'Absent rows'}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
