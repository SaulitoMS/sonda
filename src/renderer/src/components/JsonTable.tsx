import { useMemo, useState } from 'react'
import { suggestFileName } from '../../../shared/exportResponse'
import {
  ROOT,
  buildTables,
  cellText,
  downloadXlsx,
  tableToTsv,
  type TableData
} from '../lib/tables'
import { useRequestStore } from '../store/useRequestStore'

const MAX_ROWS = 500
const MAX_COLUMNS = 30
const CELL_LIMIT = 120

const BTN =
  'rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-700'

const clip = (text: string): string =>
  text.length > CELL_LIMIT ? `${text.slice(0, CELL_LIMIT - 3)}…` : text

const cellTone = (v: unknown): string => {
  if (v === null || v === undefined) return 'text-zinc-500'
  if (typeof v === 'number') return 'text-amber-300'
  if (typeof v === 'boolean') return 'text-purple-300'
  if (typeof v === 'object') return 'text-zinc-500'
  return 'text-zinc-200'
}

const slug = (title: string): string =>
  title === ROOT ? 'datos' : title.replace(/[^\w.-]+/g, '-')

function DataTable({
  table,
  showTitle,
  baseName
}: {
  table: TableData
  showTitle: boolean
  baseName: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const columns = table.columns.slice(0, MAX_COLUMNS)
  const rows = table.rows.slice(0, MAX_ROWS)
  const cut = table.rows.length > rows.length || table.columns.length > columns.length

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(tableToTsv(table))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const excel = (): void => {
    const name = baseName.replace(/\.xlsx$/, `-${slug(table.title)}.xlsx`)
    void downloadXlsx(name, [table])
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <p className="text-zinc-500">
          {showTitle && <span className="mr-2 font-semibold text-blue-300">{table.title}</span>}
          {table.rows.length} {table.rows.length === 1 ? 'fila' : 'filas'}
          {cut && ' · se muestra solo una parte; Copiar y Excel incluyen todo'}
        </p>
        <div className="ml-auto flex gap-1.5">
          <button onClick={() => void copy()} className={BTN} title="Copiar para pegar en Excel">
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
          <button onClick={excel} className={BTN} title="Descargar esta tabla como .xlsx">
            Excel
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full border-collapse text-left font-mono">
          <thead>
            <tr className="bg-zinc-900">
              {columns.map((c) => (
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
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/50">
                {row.slice(0, MAX_COLUMNS).map((cell, j) => (
                  <td
                    key={j}
                    title={cellText(cell)}
                    className={`max-w-[28rem] break-words px-3 py-1.5 align-top ${cellTone(cell)}`}
                  >
                    {clip(cellText(cell))}
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
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)
  const tables = useMemo(() => buildTables(value), [value])
  const baseName = suggestFileName(method, url, 'xlsx')

  if (tables.length === 0) {
    return <p className="text-xs text-zinc-500">No hay datos para mostrar como tabla.</p>
  }

  return (
    <div className="selectable space-y-5 text-xs">
      {tables.length > 1 && (
        <button
          onClick={() => void downloadXlsx(baseName, tables)}
          className={BTN}
          title="Un solo .xlsx con una hoja por cada tabla"
        >
          Excel · una hoja por tabla ({tables.length})
        </button>
      )}
      {tables.map((t, i) => (
        <DataTable
          key={`${t.title}-${i}`}
          table={t}
          showTitle={tables.length > 1 || t.title !== ROOT}
          baseName={baseName}
        />
      ))}
    </div>
  )
}