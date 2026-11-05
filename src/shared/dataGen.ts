import { MAX_DATA_ROWS } from './csvData'
import { interpolate } from './variables'

export interface DataColumn {
  name: string
  template: string
}

/** Una columna por línea con el formato `nombre=plantilla`. Ignora líneas vacías o sin "=" */
export function parseColumns(text: string): DataColumn[] {
  const columns: DataColumn[] = []
  for (const line of text.split('\n')) {
    const i = line.indexOf('=')
    if (i <= 0) continue
    const name = line.slice(0, i).trim()
    if (!name) continue
    columns.push({ name, template: line.slice(i + 1) })
  }
  return columns
}

/** Genera las filas; las variables dinámicas se evalúan de nuevo en cada celda */
export function generateRows(columns: DataColumn[], count: number): Record<string, string>[] {
  const n = Math.min(MAX_DATA_ROWS, Math.max(1, Math.floor(count) || 1))
  return Array.from({ length: n }, () =>
    Object.fromEntries(columns.map((c) => [c.name, interpolate(c.template, {}).text]))
  )
}

const csvCell = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value

export function toCsv(columns: DataColumn[], rows: Record<string, string>[]): string {
  const header = columns.map((c) => csvCell(c.name)).join(',')
  const lines = rows.map((r) => columns.map((c) => csvCell(r[c.name] ?? '')).join(','))
  return [header, ...lines].join('\n') + '\n'
}

export function toJson(rows: Record<string, string>[]): string {
  return JSON.stringify(rows, null, 2) + '\n'
}
