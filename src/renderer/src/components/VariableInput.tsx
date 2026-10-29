import { useRef, useState } from 'react'
import { buildVarMap } from '../../../shared/variables'
import { useEnvironmentStore } from '../store/useEnvironmentStore'

const VAR_SPLIT = /(\{\{\s*[\w.-]+\s*\}\})/g
const VAR_NAME = /\{\{\s*([\w.-]+)\s*\}\}/

interface Props {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
  placeholder?: string
}

interface Hover {
  name: string
  left: number
}

export function VariableInput({
  value,
  onChange,
  onEnter,
  placeholder
}: Props): React.JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const spanRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const [hover, setHover] = useState<Hover | null>(null)

  const data = useEnvironmentStore((s) => s.data)
  const activeEnv = data.environments.find((e) => e.id === data.activeId)
  const vars = buildVarMap(activeEnv)

  const syncScroll = (e: React.UIEvent<HTMLInputElement>): void => {
    if (backdropRef.current) backdropRef.current.scrollLeft = e.currentTarget.scrollLeft
    setHover(null)
  }

  // Detecta si el cursor está sobre alguna {{variable}} comparando con su rectángulo
  const onMouseMove = (e: React.MouseEvent<HTMLInputElement>): void => {
    const wrapper = wrapperRef.current?.getBoundingClientRect()
    if (!wrapper) return

    for (const [key, span] of spanRefs.current) {
      const r = span.getBoundingClientRect()
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const name = key.split(':')[1]
        const left = Math.max(0, r.left - wrapper.left)
        setHover((prev) => (prev?.name === name && prev.left === left ? prev : { name, left }))
        return
      }
    }
    setHover(null)
  }

  const parts = value.split(VAR_SPLIT)
  spanRefs.current.clear()

  // Info de la variable que está bajo el cursor
  const hoveredVar = hover
    ? activeEnv?.variables.find((v) => v.enabled && v.key.trim() === hover.name)
    : undefined

  return (
    <div
      ref={wrapperRef}
      className="relative flex-1 rounded-md border border-zinc-700 bg-zinc-800 focus-within:border-blue-500"
    >
      <div
        ref={backdropRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre px-3 py-2 font-mono text-sm text-zinc-200"
      >
        {parts.map((part, i) => {
          if (i % 2 === 0) return <span key={i}>{part}</span>
          const name = part.match(VAR_NAME)?.[1] ?? ''
          const defined = Object.prototype.hasOwnProperty.call(vars, name)
          return (
            <span
              key={i}
              ref={(el) => {
                if (el) spanRefs.current.set(`${i}:${name}`, el)
              }}
              className={defined ? 'font-semibold text-blue-400' : 'font-semibold text-amber-400'}
            >
              {part}
            </span>
          )
        })}
      </div>

      <input
        value={value}
        onChange={(e) => {
          setHover(null)
          onChange(e.target.value)
        }}
        onScroll={syncScroll}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.()
        }}
        placeholder={placeholder}
        spellCheck={false}
        className="relative w-full bg-transparent px-3 py-2 font-mono text-sm text-transparent caret-zinc-200 outline-none selection:bg-blue-500/30 placeholder:text-zinc-500"
      />

      {hover && (
        <div
          className="pointer-events-none absolute top-full z-50 mt-1 max-w-[420px] rounded-md border border-zinc-700 bg-zinc-950 p-2.5 text-xs shadow-xl"
          style={{ left: hover.left }}
        >
          {hoveredVar ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono font-semibold text-blue-400">{hover.name}</span>
                {hoveredVar.secret && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                    Secreto
                  </span>
                )}
              </div>
              <div className="break-all font-mono text-zinc-200">
                {hoveredVar.secret ? '••••••••' : hoveredVar.value || '(vacío)'}
              </div>
              <div className="mt-1.5 text-[10px] text-zinc-500">
                Entorno: {activeEnv?.name}
              </div>
            </>
          ) : (
            <>
              <div className="mb-1 font-mono font-semibold text-amber-400">{hover.name}</div>
              <div className="text-zinc-400">
                {activeEnv
                  ? `No está definida en el entorno "${activeEnv.name}".`
                  : 'No hay un entorno seleccionado.'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}