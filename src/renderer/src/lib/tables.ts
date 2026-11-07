import { downloadBytes } from './download'

type Row = Record<string, unknown>

export interface TableData {
  title: string
  columns: string[]
  rows: unknown[][]
}

export const ROOT = '(raíz)'
const MAX_DEPTH = 4
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const isPlainObject = (v: unknown): v is Row =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isObjectArray = (v: unknown): v is Row[] =>
  Array.isArray(v) && v.length > 0 && v.every(isPlainObject)

const tableFromObjects = (title: string, items: Row[]): TableData => {
  const columns = new Set<string>()
  for (const item of items) {
    for (const key of Object.keys(item)) columns.add(key)
  }
  const cols = [...columns]
  return { title, columns: cols, rows: items.map((item) => cols.map((c) => item[c])) }
}

const collect = (value: unknown, path: string, depth: number, out: TableData[]): void => {
  if (isObjectArray(value)) {
    out.push(tableFromObjects(path, value))
    return
  }
  if (Array.isArray(value)) {
    out.push({ title: path, columns: ['valor'], rows: value.map((v) => [v]) })
    return
  }
  if (!isPlainObject(value)) {
    out.push({ title: path, columns: ['valor'], rows: [[value]] })
    return
  }

  const props: unknown[][] = []
  const nested: [string, unknown][] = []
  for (const [key, v] of Object.entries(value)) {
    const child = path === ROOT ? key : `${path}.${key}`
    const isNestedObject = isPlainObject(v) && depth < MAX_DEPTH && Object.keys(v).length > 0
    if (isObjectArray(v) || isNestedObject) nested.push([child, v])
    else props.push([key, v])
  }
  if (props.length > 0) {
    out.push({ title: path, columns: ['propiedad', 'valor'], rows: props })
  }
  for (const [child, v] of nested) collect(v, child, depth + 1, out)
}

/** Convierte un JSON en una o varias tablas (arrays de objetos, propiedades sueltas, etc.) */
export const buildTables = (value: unknown): TableData[] => {
  const out: TableData[] = []
  collect(value, ROOT, 0, out)
  return out
}

/** Texto completo de una celda (sin recortar) */
export const cellText = (v: unknown): string => {
  if (v === undefined) return ''
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const tsvCell = (v: unknown): string => {
  const text = cellText(v)
  return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Tabla en texto separado por tabuladores: al pegarlo en Excel cae en celdas */
export const tableToTsv = (table: TableData): string => {
  const lines: unknown[][] = [table.columns, ...table.rows]
  return lines.map((row) => row.map(tsvCell).join('\t')).join('\n')
}

const csvCell = (v: unknown): string => {
  const text = cellText(v)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Tabla en CSV (separada por comas, con comillas donde hace falta) */
export const tableToCsv = (table: TableData): string => {
  const lines: unknown[][] = [table.columns, ...table.rows]
  return lines.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

const mdCell = (v: unknown): string => cellText(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

/** Tabla en Markdown, lista para pegar en un issue, un PR o un README */
export const tableToMarkdown = (table: TableData): string => {
  const line = (cells: string[]): string => `| ${cells.join(' | ')} |`
  return [
    line(table.columns.map(mdCell)),
    line(table.columns.map(() => '---')),
    ...table.rows.map((row) => line(row.map(mdCell)))
  ].join('\n')
}

const sheetNames = (tables: TableData[]): string[] => {
  const used = new Set<string>()
  return tables.map((t) => {
    const base =
      (t.title === ROOT ? 'Datos' : t.title)
        .replace(/[\\/?*[\]:]/g, '_')
        .replace(/^'+|'+$/g, '')
        .slice(0, 28) || 'Hoja'
    let name = base
    let n = 2
    while (used.has(name.toLowerCase())) name = `${base}_${n++}`
    used.add(name.toLowerCase())
    return name
  })
}

const cellValue = (v: unknown): string | number | boolean | null => {
  if (v === undefined) return null
  if (typeof v === 'number' || typeof v === 'boolean') return v
  const text = cellText(v)
  return text.length > 32000 ? text.slice(0, 32000) : text // límite de Excel por celda
}

/** Genera un .xlsx con una hoja por tabla y lo descarga */
export async function downloadXlsx(fileName: string, tables: TableData[]): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Sonda'
  workbook.created = new Date()
  const names = sheetNames(tables)

  tables.forEach((table, index) => {
    const sheet = workbook.addWorksheet(names[index], {
      views: [{ state: 'frozen', ySplit: 1 }]
    })
    sheet.addRow(table.columns)
    for (const row of table.rows) sheet.addRow(row.map(cellValue))

    table.columns.forEach((column, ci) => {
      let max = column.length
      for (const row of table.rows.slice(0, 200)) {
        max = Math.max(max, cellText(row[ci]).length)
      }
      sheet.getColumn(ci + 1).width = Math.min(Math.max(max + 2, 8), 60)
    })

    const border = {
      top: { style: 'thin' as const, color: { argb: 'FFD4D4D8' } },
      left: { style: 'thin' as const, color: { argb: 'FFD4D4D8' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFD4D4D8' } },
      right: { style: 'thin' as const, color: { argb: 'FFD4D4D8' } }
    }
    sheet.eachRow((row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = border
        cell.alignment = { vertical: 'top' }
      })
    })

    const header = sheet.getRow(1)
    header.height = 20
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      cell.alignment = { vertical: 'middle' }
    })

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: Math.max(table.columns.length, 1) }
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  downloadBytes(fileName, new Uint8Array(buffer), XLSX_MIME)
}
