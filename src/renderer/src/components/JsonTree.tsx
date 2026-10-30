import { useState } from 'react'

const isContainer = (v: unknown): v is object => v !== null && typeof v === 'object'

/** Ruta en el formato que usan el filtro, las aserciones y las extracciones: data.items[0].name */
const childPath = (parent: string, key: string, isArray: boolean): string =>
  isArray ? `${parent}[${key}]` : parent ? `${parent}.${key}` : key

function Primitive({ value }: { value: unknown }): React.JSX.Element {
  if (typeof value === 'string') return <span className="text-emerald-300">{`"${value}"`}</span>
  if (typeof value === 'number') return <span className="text-amber-300">{String(value)}</span>
  if (typeof value === 'boolean') return <span className="text-sky-300">{String(value)}</span>
  return <span className="text-zinc-500">null</span>
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
  // Los primeros 2 niveles abiertos; el resto colapsado para respuestas grandes
  const [open, setOpen] = useState(depth < 2)
  const [copied, setCopied] = useState(false)

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
        {copied ? '✓ ruta copiada' : name}
      </button>
      <span className="text-blue-300">: </span>
    </>
  )

  if (!isContainer(value)) {
    return (
      <div className="pl-4">
        {label}
        <Primitive value={value} />
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
      <button onClick={() => setOpen((o) => !o)} className="mr-1 text-zinc-500 hover:text-white">
        {open ? '▾' : '▸'}
      </button>
      {label}
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-left text-zinc-400 hover:text-white"
      >
        {openBr}
        {!open && ` ${entries.length} ${isArray ? 'items' : 'campos'} `}
        {!open && closeBr}
      </button>
      {open && (
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

export function JsonTree({ value }: { value: unknown }): React.JSX.Element {
  return (
    <div className="selectable -ml-4 font-mono text-xs text-zinc-200">
      <Node value={value} depth={0} path="" />
    </div>
  )
}
