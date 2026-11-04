import { useMemo } from 'react'

type Row = Record<string, unknown>

interface TableData {
  title: string
  columns: string[]
  rows: unknown[][]
  total: number
}

const ROOT = '(raíz)'
const MAX_ROWS = 500
const MAX_COLUMNS = 30
const MAX_DEPTH = 4

const isPlainObject = (v: unknown): v is Row =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isObjectArray = (v: unknown): v is Row[] =>
  Array.isArray(v) && v.length > 0 && v.every(isPlainObject)

const tableFromObjects = (title: string, items: Row[]): TableData => {
  const shown = items.slice(0, MAX_ROWS)
  const columns = new Set<string>()
  for (const item of shown) {
    for (const key of Object.keys(item)) {
      if (columns.size < MAX_COLUMNS) columns.add(key)
    }
  }
  const cols = [...columns]
  return {
    title,
    columns: cols,
    rows: shown.map((item) => cols.map((c) => item[c])),
    total: items.length
  }
}

const collect = (value: unknown, path: string, depth: number, out: TableData[]): void => {
  if (isObjectArray(value)) {
    out.push(tableFromObjects(path, value))
    return
  }
  if (Array.isArray(value)) {
    out.push({
      title: path,
      columns: ['valor'],
      rows: value.slice(0, MAX_ROWS).map((v) => [v]),
      total: value.length
    })
    return
  }
  if (!isPlainObject(value)) {
    out.push({ title: path, columns: ['valor'], rows: [[value]], total: 1 })
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
    out.push({ title: path, columns: ['propiedad', 'valor'], rows: props, total: props.length })
  }
  for (const [child, v] of nested) collect(v, child, depth + 1, out)
}

const cellText = (v: unknown): string => {
  if (v === undefined) return ''
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    const text = JSON.stringify(v)
    return text.length > 120 ? `${text.slice(0, 117)}…` : text
  }
  return String(v)
}

const cellTone = (v: unknown): string => {
  if (v === null || v === undefined) return 'text-zinc-500'
  if (typeof v === 'number') return 'text-amber-300'
  if (typeof v === 'boolean') return 'text-purple-300'
  if (typeof v === 'object') return 'text-zinc-500'
  return 'text-zinc-200'
}

function DataTable({
  table,
  showTitle
}: {
  table: TableData
  showTitle: boolean
}): React.JSX.Element {
  return (
    <div>
      <p className="mb-1.5 text-zinc-500">
        {showTitle && <span className="mr-2 font-semibold text-blue-300">{table.title}</span>}
        {table.total} {table.total === 1 ? 'fila' : 'filas'}
        {table.total > table.rows.length && ` (se muestran las primeras ${table.rows.length})`}
      </p>
      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full border-collapse text-left font-mono">
          <thead>
            <tr className="bg-zinc-900">
              {table.columns.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap border-b border-zinc-700 px-3 py-1.5 font-semibold text-blue-300"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/50">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    title={cellText(cell)}
                    className={`max-w-[28rem] break-words px-3 py-1.5 align-top ${cellTone(cell)}`}
                  >
                    {cellText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function JsonTable({ value }: { value: unknown }): React.JSX.Element {
  const tables = useMemo(() => {
    const out: TableData[] = []
    collect(value, ROOT, 0, out)
    return out
  }, [value])

  if (tables.length === 0) {
    return <p className="text-xs text-zinc-500">No hay datos para mostrar como tabla.</p>
  }

  return (
    <div className="selectable space-y-5 text-xs">
      {tables.map((t, i) => (
        <DataTable
          key={`${t.title}-${i}`}
          table={t}
          showTitle={tables.length > 1 || t.title !== ROOT}
        />
      ))}
    </div>
  )
}