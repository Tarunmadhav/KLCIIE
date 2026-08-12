import * as XLSX from 'xlsx'

export function downloadExcel(filename: string, rows: Array<Record<string, unknown>>, sheetName = 'Sheet1'): void {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, filename)
}

export function downloadExcelSheets(filename: string, sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>): void {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows)
    XLSX.utils.book_append_sheet(wb, ws, s.name)
  }
  XLSX.writeFile(wb, filename)
}
