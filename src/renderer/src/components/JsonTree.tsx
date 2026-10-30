import { useState } from 'react'

const isContainer = (v: unknown): v is object => v !== null && typeof v === 'object'

function Primitive({ value }: { value: unknown }): React.JSX.Element {
  if (typeof value === 'string') return <span className="text-emerald-300">{`"${value}"`}</span>
  if (typeof value === 'number') return <span className="text-amber-300">{String(value)}</span>
  if (typeof value === 'boolean') return <span className="text-sky-300">{String(value)}</span>
  return <span className="text-zinc-500">null</span>
}

function Node({
  name,
  value,
  depth
}: {
  name?: string
  value: unknown
  depth: number
}): React.JSX.Element {
  // Los primeros 2 niveles abiertos; el resto colapsado para respuestas grandes
  const [open, setOpen] = useState(depth < 2)
  const label = name !== undefined && <span className="text-blue-300">{name}: </span>

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
      <button onClick={() => setOpen((o) => !o)} className="text-left hover:text-white">
        <span className="mr-1 text-zinc-500">{open ? '▾' : '▸'}</span>
        {label}
        <span className="text-zinc-400">
          {openBr}
          {!open && ` ${entries.length} ${isArray ? 'items' : 'campos'} `}
          {!open && closeBr}
        </span>
      </button>
      {open && (
        <>
          {entries.map(([k, v]) => (
            <Node key={k} name={isArray ? `[${k}]` : k} value={v} depth={depth + 1} />
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
      <Node value={value} depth={0} />
    </div>
  )
}
