import type { Environment } from './types'

export interface DataSet {
  /** Nombres de columna (se usan como {{variable}}) */
  columns: string[]
  /** Una fila por iteración: columna → valor */
  rows: Record<string, string>[]
}

export const MAX_DATA_ROWS = 1000

/** Lee CSV (RFC 4180): comillas, comillas dobles escapadas y saltos de línea dentro de comillas */
function parseCells(text: string, delimiter: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      out.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    out.push(row)
  }
  return out.filter((r) => r.some((c) => c.trim() !== ''))
}

/** CSV con encabezados en la primera fila. Acepta coma o punto y coma, y BOM de Excel */
export function parseCsv(raw: string): DataSet {
  const text = raw.replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ','
  const cells = parseCells(text, delimiter)
  if (cells.length < 2) {
    throw new Error('El CSV necesita una fila de encabezados y al menos una de datos')
  }

  const columns = cells[0].map((c) => c.trim())
  if (columns.some((c) => !c)) throw new Error('Hay un encabezado vacío en la primera fila')
  if (new Set(columns).size !== columns.length) throw new Error('Hay encabezados repetidos')

  const rows = cells.slice(1, MAX_DATA_ROWS + 1).map((r) => {
    const obj: Record<string, string> = {}
    columns.forEach((c, i) => {
      obj[c] = r[i] ?? ''
    })
    return obj
  })
  return { columns, rows }
}

/** Arreglo JSON de objetos: [{ "email": "a@x.com" }, ...] */
export function parseJsonData(raw: string): DataSet {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('El archivo no es un JSON válido')
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('El JSON debe ser un arreglo de objetos con al menos un elemento')
  }
  const columns: string[] = []
  const rows = parsed.slice(0, MAX_DATA_ROWS).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Cada elemento del arreglo debe ser un objeto')
    }
    const obj: Record<string, string> = {}
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (!columns.includes(k)) columns.push(k)
      obj[k] = typeof v === 'string' ? v : JSON.stringify(v)
    }
    return obj
  })
  return { columns, rows }
}

/** Si el contenido empieza con "[" es JSON; si no, CSV */
export function parseDataSet(raw: string): DataSet {
  return raw.trimStart().startsWith('[') ? parseJsonData(raw) : parseCsv(raw)
}

/** Entorno con las columnas de una fila encima de sus variables (la fila gana en caso de choque) */
export function withDataVars(env: Environment | null, row: Record<string, string>): Environment {
  const keys = new Set(Object.keys(row))
  const base = env?.variables.filter((v) => !keys.has(v.key.trim())) ?? []
  return {
    id: env?.id ?? 'data-row',
    name: env?.name ?? 'Datos',
    variables: [
      ...base,
      ...Object.entries(row).map(([key, value]) => ({
        id: `data:${key}`,
        key,
        value,
        secret: false,
        enabled: true
      }))
    ]
  }
}
