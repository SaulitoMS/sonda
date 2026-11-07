import { useMemo, useState } from 'react'
import { suggestFileName } from '../../../shared/exportResponse'
import {
  ROOT,
  buildTables,
  cellText,
  downloadXlsx,
  tableToCsv,
  tableToMarkdown,
  tableToTsv,
  type TableData
} from '../lib/tables'
import { downloadText } from '../lib/download'
import { useRequestStore } from '../store/useRequestStore'

const MAX_ROWS = 500
const MAX_COLUMNS = 30
const CELL_LIMIT = 120

const BTN =
  'rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-700'

type SortDir = 'asc' | 'desc'
interface SortState {
  col: number
  dir: SortDir
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

const isEmpty = (v: unknown): boolean => v === null || v === undefined

/** Compara dos celdas; los vacíos siempre quedan al final, sea cual sea la dirección */
const compareCells = (a: unknown, b: unknown, dir: SortDir): number => {
  const aEmpty = isEmpty(a)
  const bEmpty = isEmpty(b)
  if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1

  let result: number
  if (typeof a === 'number' && typeof b === 'number') result = a - b
  else if (typeof a === 'boolean' && typeof b === 'boolean') result = Number(a) - Number(b)
  else result = collator.compare(cellText(a), cellText(b))
  return dir === 'asc' ? result : -result
}

const clip = (text: string): string =>
  text.length > CELL_LIMIT ? `${text.slice(0, CELL_LIMIT - 3)}…` : text

const cellTone = (v: unknown): string => {
  if (v === null || v === undefined) return 'text-zinc-500'
  if (typeof v === 'number') return 'text-amber-300'
  if (typeof v === 'boolean') return 'text-purple-300'
  if (typeof v === 'object') return 'text-zinc-500'
  return 'text-zinc-200'
}

const slug = (title: string): string => (title === ROOT ? 'datos' : title.replace(/[^\w.-]+/g, '-'))

/** Texto con las coincidencias de la búsqueda resaltadas */
function Marked({ text, query }: { text: string; query: string }): React.JSX.Element {
  if (!query) return <>{text}</>
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const parts: React.ReactNode[] = []
  let from = 0
  let at = lower.indexOf(q)
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(
      <mark key={at} className="rounded bg-amber-500/40 text-inherit">
        {text.slice(at, at + q.length)}
      </mark>
    )
    from = at + q.length
    at = lower.indexOf(q, from)
  }
  parts.push(text.slice(from))
  return <>{parts}</>
}

function DataTable({
  table,
  showTitle,
  baseName,
  query
}: {
  table: TableData
  showTitle: boolean
  baseName: string
  query: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [copiedMd, setCopiedMd] = useState(false)
  const [sort, setSort] = useState<SortState | null>(null)

  const activeSort = sort && sort.col < table.columns.length ? sort : null

  // Filas que cumplen la búsqueda, ya ordenadas
  const visible = useMemo(() => {
    const q = query.toLowerCase()
    let list = q
      ? table.rows.filter((row) => row.some((cell) => cellText(cell).toLowerCase().includes(q)))
      : table.rows
    if (activeSort) {
      const { col, dir } = activeSort
      list = [...list].sort((a, b) => compareCells(a[col], b[col], dir))
    }
    return list
  }, [table, query, activeSort])

  const columns = table.columns.slice(0, MAX_COLUMNS)
  const shown = visible.slice(0, MAX_ROWS)
  const cut = visible.length > shown.length || table.columns.length > columns.length
  const filtering = query !== ''

  // Lo que se copia o exporta es lo que se ve: filtrado y ordenado (todas las filas, no solo las mostradas)
  const exported: TableData = { ...table, rows: visible }

  const toggleSort = (col: number): void =>
    setSort((s) =>
      !s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null
    )

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(tableToTsv(exported))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const copyMarkdown = async (): Promise<void> => {
    await navigator.clipboard.writeText(tableToMarkdown(exported))
    setCopiedMd(true)
    setTimeout(() => setCopiedMd(false), 1500)
  }

  // El BOM hace que Excel lea bien los acentos del CSV
  const csv = (): void => {
    const name = baseName.replace(/\.xlsx$/, `-${slug(table.title)}.csv`)
    downloadText(name, `\uFEFF${tableToCsv(exported)}`, 'text/csv')
  }

  const excel = (): void => {
    const name = baseName.replace(/\.xlsx$/, `-${slug(table.title)}.xlsx`)
    void downloadXlsx(name, [exported])
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <p className="text-zinc-500">
          {showTitle && <span className="mr-2 font-semibold text-blue-300">{table.title}</span>}
          {filtering
            ? `${visible.length} de ${table.rows.length} filas`
            : `${table.rows.length} ${table.rows.length === 1 ? 'fila' : 'filas'}`}
          {cut && ' · se muestra solo una parte; Copiar, Markdown, CSV y Excel incluyen todo'}
        </p>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() => void copy()}
            disabled={visible.length === 0}
            className={`${BTN} disabled:opacity-40`}
            title="Copiar para pegar en Excel"
          >
            {copied ? '¡Copiado!' : 'Copiar'}
          </button>
          <button
            onClick={() => void copyMarkdown()}
            disabled={visible.length === 0}
            className={`${BTN} disabled:opacity-40`}
            title="Copiar como tabla Markdown"
          >
            {copiedMd ? '¡Copiado!' : 'Markdown'}
          </button>
          <button
            onClick={csv}
            disabled={visible.length === 0}
            className={`${BTN} disabled:opacity-40`}
            title="Descargar esta tabla como .csv"
          >
            CSV
          </button>
          <button
            onClick={excel}
            disabled={visible.length === 0}
            className={`${BTN} disabled:opacity-40`}
            title="Descargar esta tabla como .xlsx"
          >
            Excel
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded border border-zinc-800 px-3 py-2 text-amber-400">
          Sin coincidencias para &quot;{query}&quot;
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full border-collapse text-left font-mono">
            <thead>
              <tr className="bg-zinc-900">
                {columns.map((c, ci) => (
                  <th
                    key={c}
                    onClick={() => toggleSort(ci)}
                    title="Clic para ordenar"
                    className="cursor-pointer select-none whitespace-nowrap border-b border-zinc-700 px-3 py-1.5 font-semibold text-blue-300 hover:bg-zinc-800"
                  >
                    {c}
                    <span className="ml-1.5 inline-block w-3 text-[10px] text-zinc-400">
                      {activeSort?.col === ci ? (activeSort.dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/50"
                >
                  {row.slice(0, MAX_COLUMNS).map((cell, j) => (
                    <td
                      key={j}
                      title={cellText(cell)}
                      className={`max-w-[28rem] break-words px-3 py-1.5 align-top ${cellTone(cell)}`}
                    >
                      <Marked text={clip(cellText(cell))} query={query} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function JsonTable({ value }: { value: unknown }): React.JSX.Element {
  const method = useRequestStore((s) => s.method)
  const url = useRequestStore((s) => s.url)
  const tables = useMemo(() => buildTables(value), [value])
  const baseName = suggestFileName(method, url, 'xlsx')
  const [search, setSearch] = useState('')
  const query = search.trim()

  if (tables.length === 0) {
    return <p className="text-xs text-zinc-500">No hay datos para mostrar como tabla.</p>
  }

  return (
    <div className="selectable space-y-4 text-xs">
      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearch('')
          }}
          placeholder="Buscar en las tablas…  (Esc para limpiar)"
          spellCheck={false}
          className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 outline-none placeholder:text-zinc-500 focus:border-blue-500"
        />
        {tables.length > 1 && (
          <button
            onClick={() => void downloadXlsx(baseName, tables)}
            className={`${BTN} shrink-0`}
            title="Un solo .xlsx con una hoja por cada tabla (sin filtro ni orden)"
          >
            Excel · una hoja por tabla ({tables.length})
          </button>
        )}
      </div>

      <div className="space-y-5">
        {tables.map((t, i) => (
          <DataTable
            key={`${t.title}-${i}`}
            table={t}
            showTitle={tables.length > 1 || t.title !== ROOT}
            baseName={baseName}
            query={query}
          />
        ))}
      </div>
    </div>
  )
}
