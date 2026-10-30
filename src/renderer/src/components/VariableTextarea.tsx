import { useState } from 'react'
import { DYNAMIC_VARIABLES } from '../../../shared/dynamicVariables'
import {
  openVariableAt,
  suggestionEdit,
  suggestVariables,
  type OpenVariable,
  type VarSuggestion
} from '../../../shared/varSuggest'
import { applyEdit } from '../lib/applyEdit'
import { caretPosition } from '../lib/caretPosition'
import { useEnvironmentStore } from '../store/useEnvironmentStore'

const LIST_WIDTH = 360
const ITEM_HEIGHT = 30

interface Props {
  value: string
  onChange: (value: string) => void
  /** Atajos propios del editor (ej: sangría de JSON). Corre si la lista no consumió la tecla */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  className?: string
}

interface SuggestState {
  open: OpenVariable
  items: VarSuggestion[]
  index: number
  left: number
  top: number
}

export function VariableTextarea({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className
}: Props): React.JSX.Element {
  const [suggest, setSuggest] = useState<SuggestState | null>(null)

  const data = useEnvironmentStore((s) => s.data)
  const activeEnv = data.environments.find((e) => e.id === data.activeId)
  const envInfo = (activeEnv?.variables ?? [])
    .filter((v) => v.enabled && v.key.trim())
    .map((v) => ({ name: v.key.trim(), value: v.value, secret: v.secret }))

  // Abre o cierra la lista según lo que haya antes del cursor
  const refresh = (el: HTMLTextAreaElement): void => {
    const open =
      el.selectionStart === el.selectionEnd ? openVariableAt(el.value, el.selectionStart) : null
    if (!open) {
      setSuggest(null)
      return
    }
    const items = suggestVariables(open.query, envInfo, DYNAMIC_VARIABLES)
    if (items.length === 0) {
      setSuggest(null)
      return
    }

    const pos = caretPosition(el, el.selectionStart)
    const height = items.length * ITEM_HEIGHT + 8
    const below = pos.bottom + 4
    setSuggest({
      open,
      items,
      index: 0,
      left: Math.max(8, Math.min(pos.left, window.innerWidth - LIST_WIDTH - 16)),
      // Si no cabe debajo del cursor, se muestra arriba
      top: below + height > window.innerHeight ? Math.max(8, pos.top - height - 4) : below
    })
  }

  const accept = (el: HTMLTextAreaElement, item: VarSuggestion): void => {
    if (!suggest) return
    const edit = suggestionEdit(el.value, el.selectionStart, suggest.open, item.name)
    const end = edit.from + edit.insert.length
    // applyEdit conserva el historial de deshacer (Ctrl/Cmd + Z)
    applyEdit(el, { ...edit, selStart: end, selEnd: end }, onChange)
    setSuggest(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
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
      // Ctrl/Cmd + Enter sigue siendo "enviar petición"
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault()
        accept(e.currentTarget, suggest.items[suggest.index])
        return
      }
      if (e.key === 'Escape') {
        e.stopPropagation()
        setSuggest(null)
        return
      }
    }

    onKeyDown?.(e)

    // Las ediciones asistidas (cierre de llaves, sangría) mueven el cursor después de
    // escribir, así que se revisa cuando el navegador ya terminó de colocarlo
    const el = e.currentTarget
    requestAnimationFrame(() => refresh(el))
  }

  return (
    <>
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          refresh(e.target)
        }}
        onKeyDown={handleKeyDown}
        onClick={(e) => refresh(e.currentTarget)}
        onBlur={() => setSuggest(null)}
        onScroll={() => setSuggest(null)}
        placeholder={placeholder}
        spellCheck={false}
        className={className}
      />

      {suggest && (
        <div
          // Evita que el textarea pierda el foco (y cierre la lista) al hacer clic en una opción
          onMouseDown={(e) => e.preventDefault()}
          style={{ left: suggest.left, top: suggest.top, width: LIST_WIDTH }}
          className="fixed z-50 overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 py-1 text-xs shadow-xl"
        >
          {suggest.items.map((item, i) => (
            <div
              key={`${item.kind}:${item.name}`}
              onMouseEnter={() => setSuggest((s) => (s ? { ...s, index: i } : s))}
              onClick={(e) => {
                const el = e.currentTarget.parentElement?.previousElementSibling
                if (el instanceof HTMLTextAreaElement) accept(el, item)
              }}
              style={{ height: ITEM_HEIGHT }}
              className={`flex cursor-pointer items-center gap-2 px-2.5 ${
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
    </>
  )
}