import { useEffect, useMemo, useRef, useState } from 'react'
import type { RequestItem } from '../../../shared/types'
import { METHOD_COLORS } from '../lib/methodColors'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useTabsStore } from '../store/useTabsStore'

/** Una acción que se puede lanzar desde la paleta (abrir un modal, cambiar de tema…) */
export interface Command {
  id: string
  label: string
  /** Texto gris a la derecha: atajo o descripción corta */
  hint?: string
  /** Palabras extra para encontrarla (ej: "oscuro" para el tema) */
  keywords?: string
  run: () => void
}

interface RequestEntry {
  item: RequestItem
  /** "Colección / carpeta" */
  where: string
}

type Row = { kind: 'command'; command: Command } | { kind: 'request'; entry: RequestEntry }

interface Props {
  onClose: () => void
  commands: Command[]
}

/** Todas las letras de `query` aparecen en `text` en orden (búsqueda difusa simple) */
function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 1
  const direct = t.indexOf(q)
  if (direct !== -1) return 1000 - direct
  let pos = 0
  for (const ch of q) {
    pos = t.indexOf(ch, pos)
    if (pos === -1) return 0
    pos++
  }
  return 1
}

export function CommandPalette({ onClose, commands }: Props): React.JSX.Element {
  const collections = useCollectionsStore((s) => s.collections)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<RequestEntry[]>(() => {
    const all: RequestEntry[] = []
    for (const c of collections) {
      for (const r of c.requests) all.push({ item: r, where: c.name })
      for (const f of c.folders) {
        for (const r of f.requests) all.push({ item: r, where: `${c.name} / ${f.name}` })
      }
    }
    return all
  }, [collections])

  // ">" al inicio: solo acciones
  const commandsOnly = query.trimStart().startsWith('>')
  const text = commandsOnly ? query.trimStart().slice(1) : query

  const rows = useMemo<Row[]>(() => {
    const cmds = commands
      .map((command) => ({
        command,
        score: fuzzyScore(`${command.label} ${command.keywords ?? ''}`, text)
      }))
      .filter((r) => r.score > 0)

    // Sin texto: acciones primero y luego las peticiones, en su orden natural
    if (!text.trim()) {
      const reqs: Row[] = commandsOnly
        ? []
        : entries.slice(0, 30).map((entry) => ({ kind: 'request', entry }))
      return [...cmds.map((r): Row => ({ kind: 'command', command: r.command })), ...reqs]
    }

    const reqs = commandsOnly
      ? []
      : entries
          .map((entry) => ({
            entry,
            score: Math.max(
              fuzzyScore(entry.item.name, text),
              fuzzyScore(`${entry.item.method} ${entry.where} ${entry.item.name}`, text) / 2
            )
          }))
          .filter((r) => r.score > 0)

    return [
      ...cmds.map((r) => ({ score: r.score, row: { kind: 'command', command: r.command } as Row })),
      ...reqs.map((r) => ({ score: r.score, row: { kind: 'request', entry: r.entry } as Row }))
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((r) => r.row)
  }, [commands, entries, text, commandsOnly])

  // Mantiene visible la fila seleccionada
  useEffect(() => {
    const el = listRef.current?.children[index] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const choose = async (row: Row | undefined): Promise<void> => {
    if (!row) return
    if (row.kind === 'command') {
      onClose()
      row.command.run()
      return
    }
    const saved = await window.api.readRequest(row.entry.item.path)
    useTabsStore.getState().openSaved(saved, row.entry.item.path)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void choose(rows[index])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[15vh]"
      onMouseDown={onClose}
    >
      <div
        className="w-[600px] max-w-[92vw] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Buscar peticiones o acciones…  (escribe > para ver solo acciones)"
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-zinc-500">Sin resultados</p>
          )}
          {rows.map((row, i) => (
            <div
              key={row.kind === 'command' ? `c:${row.command.id}` : `r:${row.entry.item.path}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => void choose(row)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-1.5 text-xs ${
                i === index ? 'bg-blue-500/15 text-zinc-100' : 'text-zinc-300'
              }`}
            >
              {row.kind === 'command' ? (
                <>
                  <span className="w-10 shrink-0 font-bold text-zinc-500">›</span>
                  <span className="truncate">{row.command.label}</span>
                  {row.command.hint && (
                    <span className="ml-auto shrink-0 truncate text-zinc-500">
                      {row.command.hint}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span
                    className={`w-10 shrink-0 font-bold ${METHOD_COLORS[row.entry.item.method]}`}
                  >
                    {row.entry.item.method === 'PATCH' ? 'PAT' : row.entry.item.method.slice(0, 4)}
                  </span>
                  <span className="truncate">{row.entry.item.name}</span>
                  <span className="ml-auto shrink-0 truncate text-zinc-500">
                    {row.entry.where}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-4 border-t border-zinc-800 px-4 py-1.5 text-[10px] text-zinc-500">
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>
  )
}