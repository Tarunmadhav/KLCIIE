interface ExportOptions { superAdmin?: boolean }

function prepareRows(rows: Array<Record<string, unknown>>, superAdmin?: boolean): Array<Record<string, unknown>> | null {
  if (!superAdmin || rows.length === 0) return rows
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const selected = window.prompt(`Columns to export (comma-separated).\nAvailable: ${keys.join(', ')}\nLeave blank for all columns.`, keys.join(', '))
  if (selected === null) return null
  const wanted = selected.trim() ? selected.split(',').map((key) => key.trim()).filter((key) => keys.includes(key)) : keys
  const rowFilter = window.prompt('Rows to export: type ALL, PRESENT, or ABSENT.', 'ALL')
  if (rowFilter === null) return null
  const filter = rowFilter.trim().toUpperCase()
  return rows
    .filter((row) => {
      if (filter === 'ALL') return true
      const status = String(row['Final Attendance'] ?? row.Status ?? row.status ?? '').toUpperCase()
      return filter === 'PRESENT' ? status.includes('PRESENT') : filter === 'ABSENT' ? status.includes('ABSENT') : true
    })
    .map((row) => Object.fromEntries(wanted.map((key) => [key, row[key] ?? ''])))
}

export async function downloadExcel(filename: string, rows: Array<Record<string, unknown>>, sheetName = 'Sheet1', options?: ExportOptions): Promise<void> {
  const prepared = prepareRows(rows, options?.superAdmin)
  if (!prepared) return
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(prepared)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

export async function downloadExcelSheets(filename: string, sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>, options?: ExportOptions): Promise<void> {
  const preparedSheets = sheets.map((sheet) => ({ ...sheet, rows: prepareRows(sheet.rows, options?.superAdmin) }))
  if (preparedSheets.some((sheet) => !sheet.rows)) return
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const s of preparedSheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows ?? [])
    XLSX.utils.book_append_sheet(wb, ws, s.name)
  }
  XLSX.writeFile(wb, filename)
}
