import { createContext, useContext, useState } from 'react'
import { childPath, type TreeSearch } from '../lib/search'
import { Highlight } from './Highlight'

const isContainer = (v: unknown): v is object => v !== null && typeof v === 'object'

/** Búsqueda activa: la lee cada nodo para resaltar y para abrirse si tiene coincidencias dentro */
interface SearchState {
  query: string
  active: number
  tree: TreeSearch
}
const SearchContext = createContext<SearchState | null>(null)

function Primitive({ value, path }: { value: unknown; path: string }): React.JSX.Element {
  const search = useContext(SearchContext)
  const start = search?.tree.starts.get(`${path}|v`)
  const hl = (text: string): React.JSX.Element => (
    <Highlight text={text} query={search?.query ?? ''} start={start} active={search?.active ?? -1} />
  )

  if (typeof value === 'string')
    return (
      <span className="text-emerald-300">
        {'"'}
        {hl(value)}
        {'"'}
      </span>
    )
  if (typeof value === 'number') return <span className="text-amber-300">{hl(String(value))}</span>
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
  // Los primeros 2 niveles abiertos; el resto colapsado para respuestas grandes
  const [open, setOpen] = useState(depth < 2)
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
      <div className="pl-4">
        {label}
        <Primitive value={value} path={path} />
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
      <button onClick={() => setOpen(!isOpen)} className="mr-1 text-zinc-500 hover:text-white">
        {isOpen ? '▾' : '▸'}
      </button>
      {label}
      <button onClick={() => setOpen(!isOpen)} className="text-left text-zinc-400 hover:text-white">
        {openBr}
        {!isOpen && ` ${entries.length} ${isArray ? 'items' : 'campos'} `}
        {!isOpen && closeBr}
      </button>
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
  search
}: {
  value: unknown
  search?: SearchState
}): React.JSX.Element {
  return (
    <SearchContext.Provider value={search ?? null}>
      <div className="selectable -ml-4 font-mono text-xs text-zinc-200">
        <Node value={value} depth={0} path="" />
      </div>
    </SearchContext.Provider>
  )
}