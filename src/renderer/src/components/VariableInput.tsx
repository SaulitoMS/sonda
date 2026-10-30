import { useRef, useState } from 'react'
import {
  DYNAMIC_VARIABLES,
  getDynamicVariable,
  isDynamicVariable
} from '../../../shared/dynamicVariables'
import {
  applySuggestion,
  openVariableAt,
  suggestVariables,
  type OpenVariable,
  type VarSuggestion
} from '../../../shared/varSuggest'
import { buildVarMap } from '../../../shared/variables'
import { useEnvironmentStore } from '../store/useEnvironmentStore'

const VAR_SPLIT = /(\{\{\s*\$?[\w.-]+\s*\}\})/g
const VAR_NAME = /\{\{\s*(\$?[\w.-]+)\s*\}\}/

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

interface SuggestState {
  open: OpenVariable
  items: VarSuggestion[]
  index: number
  /** Posición en pantalla de la lista (fixed), para que ningún contenedor con scroll la corte */
  left: number
  top: number
}

export function VariableInput({ value, onChange, onEnter, placeholder }: Props): React.JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const spanRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const [hover, setHover] = useState<Hover | null>(null)
  const [suggest, setSuggest] = useState<SuggestState | null>(null)

  const data = useEnvironmentStore((s) => s.data)
  const activeEnv = data.environments.find((e) => e.id === data.activeId)
  const vars = buildVarMap(activeEnv)

  const envInfo = (activeEnv?.variables ?? [])
    .filter((v) => v.enabled && v.key.trim())
    .map((v) => ({ name: v.key.trim(), value: v.value, secret: v.secret }))

  // Abre o cierra la lista según lo que haya antes del cursor
  // Abre o cierra la lista según lo que haya antes del cursor
  const refreshSuggest = (text: string, cursor: number | null): void => {
    const open = cursor === null ? null : openVariableAt(text, cursor)
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!open || !rect) {
      setSuggest(null)
      return
    }
    const items = suggestVariables(open.query, envInfo, DYNAMIC_VARIABLES)
    setSuggest(
      items.length > 0
        ? {
            open,
            items,
            index: 0,
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 376)),
            top: rect.bottom + 4
          }
        : null
    )
  }

  const accept = (item: VarSuggestion): void => {
    if (!suggest) return
    const cursor = inputRef.current?.selectionStart ?? value.length
    const next = applySuggestion(value, cursor, suggest.open, item.name)
    onChange(next.text)
    setSuggest(null)
    // El valor se actualiza al re-renderizar: el cursor se coloca justo después
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.cursor, next.cursor))
  }

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
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      ) {
        const name = key.split(':')[1]
        const left = Math.max(0, r.left - wrapper.left)
        setHover((prev) => (prev?.name === name && prev.left === left ? prev : { name, left }))
        return
      }
    }
    setHover(null)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (suggest) {
      const n = suggest.items.length
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSuggest({ ...suggest, index: (suggest.index + 1) % n })
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSuggest({ ...suggest, index: (suggest.index - 1 + n) % n })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        accept(suggest.items[suggest.index])
        return
      }
      if (e.key === 'Escape') {
        e.stopPropagation()
        setSuggest(null)
        return
      }
    }
    if (e.key === 'Enter') onEnter?.()
  }

  const parts = value.split(VAR_SPLIT)

  // Info de la variable que está bajo el cursor
  const hoveredDynamic = hover ? getDynamicVariable(hover.name) : undefined
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
          const dynamic = isDynamicVariable(name)
          const defined = dynamic || Object.prototype.hasOwnProperty.call(vars, name)
          return (
            <span
              key={i}
              ref={(el) => {
                // React llama al ref anterior con null antes de registrar el nuevo,
                // así el mapa se mantiene sincronizado sin tocarlo durante el render
                const key = `${i}:${name}`
                if (el) spanRefs.current.set(key, el)
                else spanRefs.current.delete(key)
              }}
              className={`font-semibold ${
                dynamic ? 'text-emerald-400' : defined ? 'text-blue-400' : 'text-amber-400'
              }`}
            >
              {part}
            </span>
          )
        })}
      </div>

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setHover(null)
          onChange(e.target.value)
          refreshSuggest(e.target.value, e.target.selectionStart)
        }}
        onScroll={syncScroll}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            refreshSuggest(e.currentTarget.value, e.currentTarget.selectionStart)
          }
        }}
        onClick={(e) => refreshSuggest(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setSuggest(null)}
        placeholder={placeholder}
        spellCheck={false}
        className="relative w-full bg-transparent px-3 py-2 font-mono text-sm text-transparent caret-zinc-200 outline-none selection:bg-blue-500/30 placeholder:text-zinc-500"
      />

      {suggest && (
        <div
          // Evita que el input pierda el foco (y cierre la lista) al hacer clic en una opción
          onMouseDown={(e) => e.preventDefault()}
          style={{ left: suggest.left, top: suggest.top }}
          className="fixed z-50 w-[360px] overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 py-1 text-xs shadow-xl"
        >
          {suggest.items.map((item, i) => (
            <div
              key={`${item.kind}:${item.name}`}
              onMouseEnter={() => setSuggest((s) => (s ? { ...s, index: i } : s))}
              onClick={() => accept(item)}
              className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 ${
                i === suggest.index ? 'bg-zinc-800' : ''
              }`}
            >
              <span
                className={`shrink-0 font-mono font-semibold ${
                  item.kind === 'dynamic' ? 'text-emerald-400' : 'text-blue-400'
                }`}
              >
                {item.name}
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-zinc-500">
                {item.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute top-full z-50 mt-1 max-w-[420px] rounded-md border border-zinc-700 bg-zinc-950 p-2.5 text-xs shadow-xl"
          style={{ left: hover.left }}
        >
          {hoveredDynamic ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono font-semibold text-emerald-400">{hover.name}</span>
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                  Dinámica
                </span>
              </div>
              <div className="text-zinc-200">{hoveredDynamic.description}</div>
              <div className="mt-1.5 text-[10px] text-zinc-500">
                Se genera de nuevo en cada envío
              </div>
            </>
          ) : hoveredVar ? (
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
              <div className="mt-1.5 text-[10px] text-zinc-500">Entorno: {activeEnv?.name}</div>
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
