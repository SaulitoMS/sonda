import { createContext, useContext, useState } from 'react'
import { childPath, type TreeSearch } from '../lib/search'
import { Highlight } from './Highlight'
import { timestampHint } from '../../../shared/timestampHint'
import { pathReaches } from '../../../shared/extractFromTree'

const isContainer = (v: unknown): v is object => v !== null && typeof v === 'object'

/** Búsqueda activa: la lee cada nodo para resaltar y para abrirse si tiene coincidencias dentro */
interface SearchState {
  query: string
  active: number
  tree: TreeSearch
}
const SearchContext = createContext<SearchState | null>(null)

/** Hasta qué profundidad se abren los nodos al montarse. Al cambiar la `key` del árbol se reinician */
const DepthContext = createContext(2)

/** Tope de "Expandir todo" para no congelar la interfaz con respuestas enormes */
const MAX_EXPAND_DEPTH = 12

function CopyValue({ value }: { value: unknown }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      onClick={copy}
      title="Copiar valor"
      className={`ml-2 opacity-0 transition-opacity focus:opacity-100 group-hover/row:opacity-100 ${
        copied ? 'text-emerald-300' : 'text-zinc-500 hover:text-zinc-200'
      }`}
    >
      {copied ? '✓ copiado' : 'copiar'}
    </button>
  )
}

interface ExtractState {
  onExtract: (path: string) => void
  /** Solo se ofrece extraer si la ruta apunta de verdad a ese valor */
  canExtract: (path: string, value: unknown) => boolean
}
const ExtractContext = createContext<ExtractState | null>(null)

function ExtractButton({
  path,
  value
}: {
  path: string
  value: unknown
}): React.JSX.Element | null {
  const ctx = useContext(ExtractContext)
  const [added, setAdded] = useState(false)
  if (!ctx || !ctx.canExtract(path, value)) return null

  return (
    <button
      onClick={() => {
        ctx.onExtract(path)
        setAdded(true)
      }}
      title="Guardar este valor en una variable (queda en la pestaña Extraer)"
      className={`ml-2 transition-opacity focus:opacity-100 ${
        added
          ? 'text-emerald-300'
          : 'text-zinc-500 opacity-0 hover:text-zinc-200 group-hover/row:opacity-100'
      }`}
    >
      {added ? '✓ en Extraer' : '→ variable'}
    </button>
  )
}

function Primitive({ value, path }: { value: unknown; path: string }): React.JSX.Element {
  const search = useContext(SearchContext)
  const start = search?.tree.starts.get(`${path}|v`)
  const hl = (text: string): React.JSX.Element => (
    <Highlight
      text={text}
      query={search?.query ?? ''}
      start={start}
      active={search?.active ?? -1}
    />
  )

  if (typeof value === 'string')
    return (
      <span className="text-emerald-300">
        {'"'}
        {hl(value)}
        {'"'}
      </span>
    )
  if (typeof value === 'number') {
    // El nombre del campo es el último tramo de la ruta (en arrays termina en "]" y no aplica)
    const key = /([^.[\]]+)$/.exec(path)?.[1]
    const hint = timestampHint(value, key)
    return (
      <span className="text-amber-300">
        {hl(String(value))}
        {hint && (
          <span className="ml-2 text-zinc-500">
            {'// '}
            {hint}
          </span>
        )}
      </span>
    )
  }
  if (typeof value === 'boolean') return <span className="text-sky-300">{hl(String(value))}</span>
  return <span className="text-zinc-500">{hl('null')}</span>
}

function Node({
  name,
  value,
  depth,
  path
}: {
  name?: string
  value: unknown
  depth: number
  path: string
}): React.JSX.Element {
  const search = useContext(SearchContext)
  const openDepth = useContext(DepthContext)
  // Por defecto los primeros 2 niveles abiertos; "Expandir/Colapsar todo" cambian esa profundidad
  const [open, setOpen] = useState(depth < openDepth)
  const [copied, setCopied] = useState(false)
  // Mientras se busca, las ramas con coincidencias dentro se mantienen abiertas
  const isOpen = open || (search?.tree.open.has(path) ?? false)

  const copyPath = async (): Promise<void> => {
    await navigator.clipboard.writeText(path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const label = name !== undefined && (
    <>
      <button
        onClick={copyPath}
        title={`Clic para copiar la ruta: ${path}`}
        className={`${copied ? 'text-emerald-300' : 'text-blue-300'} hover:underline`}
      >
        {copied ? (
          '✓ ruta copiada'
        ) : (
          <Highlight
            text={name}
            query={search?.query ?? ''}
            start={search?.tree.starts.get(`${path}|k`)}
            active={search?.active ?? -1}
          />
        )}
      </button>
      <span className="text-blue-300">: </span>
    </>
  )

  if (!isContainer(value)) {
    return (
      <div className="group/row pl-4">
        {label}
        <Primitive value={value} path={path} />
        <CopyValue value={value} />
        <ExtractButton path={path} value={value} />
      </div>
    )
  }

  const isArray = Array.isArray(value)
  const entries: [string, unknown][] = isArray
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value)
  const [openBr, closeBr] = isArray ? ['[', ']'] : ['{', '}']

  return (
    <div className="pl-4">
      <div className="group/row">
        <button onClick={() => setOpen(!isOpen)} className="mr-1 text-zinc-500 hover:text-white">
          {isOpen ? '▾' : '▸'}
        </button>
        {label}
        <button
          onClick={() => setOpen(!isOpen)}
          className="text-left text-zinc-400 hover:text-white"
        >
          {openBr}
          {!isOpen && ` ${entries.length} ${isArray ? 'items' : 'campos'} `}
          {!isOpen && closeBr}
        </button>
        <CopyValue value={value} />
      </div>
      {isOpen && (
        <>
          {entries.map(([k, v]) => (
            <Node
              key={k}
              name={isArray ? `[${k}]` : k}
              value={v}
              depth={depth + 1}
              path={childPath(path, k, isArray)}
            />
          ))}
          <div className="pl-4 text-zinc-400">{closeBr}</div>
        </>
      )}
    </div>
  )
}

export function JsonTree({
  value,
  search,
  onExtract
}: {
  value: unknown
  search?: SearchState
  /** Si se pasa, cada valor ofrece "→ variable". Solo debe usarse con el body completo (sin filtrar) */
  onExtract?: (path: string) => void
}): React.JSX.Element {
  // Cada cambio de `version` remonta los nodos, y así vuelven a leer la profundidad inicial
  const [view, setView] = useState({ depth: 2, version: 0 })
  const apply = (depth: number): void => setView((v) => ({ depth, version: v.version + 1 }))

  const extract: ExtractState | null = onExtract
    ? { onExtract, canExtract: (path, v) => pathReaches(value, path, v) }
    : null

  return (
    <SearchContext.Provider value={search ?? null}>
      <DepthContext.Provider value={view.depth}>
        <ExtractContext.Provider value={extract}>
          <div className="mb-1 flex justify-end gap-3 text-[11px] text-zinc-500">
            <button onClick={() => apply(MAX_EXPAND_DEPTH)} className="hover:text-zinc-200">
              Expandir todo
            </button>
            <button onClick={() => apply(1)} className="hover:text-zinc-200">
              Colapsar todo
            </button>
          </div>
          <div className="selectable -ml-4 font-mono text-xs text-zinc-200">
            <Node key={view.version} value={value} depth={0} path="" />
          </div>
        </ExtractContext.Provider>
      </DepthContext.Provider>
    </SearchContext.Provider>
  )
}
