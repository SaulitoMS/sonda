import { useEffect, useMemo, useRef, useState } from 'react'
import type { HttpMethod, RequestItem } from '../../../shared/types'
import { METHOD_BADGE } from '../lib/methodColors'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useTabsStore } from '../store/useTabsStore'
import { useQuickAccess } from '../lib/quickAccess'
import { Icon } from './Icon'

const SHORT: Record<HttpMethod, string> = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PAT',
  DELETE: 'DEL',
  HEAD: 'HEAD',
  OPTIONS: 'OPT'
}

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
  /** Por qué aparece arriba cuando no hay texto de búsqueda */
  tag?: 'pinned' | 'recent'
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
  const quick = useQuickAccess()
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

    // Sin texto: fijadas y recientes, luego acciones y luego el resto de peticiones
    if (!text.trim()) {
      const cmdRows = cmds.map((r): Row => ({ kind: 'command', command: r.command }))
      if (commandsOnly) return cmdRows

      const byPath = new Map(entries.map((e) => [e.item.path, e]))
      const pinned = quick.pinned.flatMap((p) => byPath.get(p) ?? [])
      const recent = quick.recent
        .filter((p) => !quick.pinned.includes(p))
        .flatMap((p) => byPath.get(p) ?? [])
      const shown = new Set([...pinned, ...recent].map((e) => e.item.path))
      const rest = entries.filter((e) => !shown.has(e.item.path)).slice(0, 30)

      return [
        ...pinned.map((entry): Row => ({ kind: 'request', entry: { ...entry, tag: 'pinned' } })),
        ...recent.map((entry): Row => ({ kind: 'request', entry: { ...entry, tag: 'recent' } })),
        ...cmdRows,
        ...rest.map((entry): Row => ({ kind: 'request', entry }))
      ]
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
  }, [commands, entries, text, commandsOnly, quick])

  // Mantiene visible la fila seleccionada
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' })
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

  // Sin texto de búsqueda se agrupa en secciones; con texto, lista única ordenada por relevancia
  const sectionOf = (row: Row): string =>
    row.kind === 'command'
      ? 'Acciones'
      : row.entry.tag === 'pinned'
        ? 'Fijadas'
        : row.entry.tag === 'recent'
          ? 'Recientes'
          : 'Peticiones'
  const grouped = !text.trim() && !commandsOnly

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="anim-pop w-[640px] max-w-[92vw] overflow-hidden rounded-2xl border border-zinc-700/70 bg-zinc-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4">
          <Icon name="search" size={16} className="text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Buscar peticiones o acciones…"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          {commandsOnly && (
            <span className="rounded-md bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
              Solo acciones
            </span>
          )}
          <kbd className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-zinc-500">
              <Icon name="search" size={20} />
              <p className="text-xs">Sin resultados para «{text.trim()}»</p>
            </div>
          )}

          {rows.map((row, i) => {
            const section = sectionOf(row)
            const showHeading = grouped && (i === 0 || sectionOf(rows[i - 1]) !== section)
            const selected = i === index

            return (
              <div
                key={row.kind === 'command' ? `c:${row.command.id}` : `r:${row.entry.item.path}`}
              >
                {showHeading && (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    {section}
                  </p>
                )}
                <div
                  data-index={i}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => void choose(row)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                    selected ? 'bg-blue-500/15 text-zinc-100' : 'text-zinc-300'
                  }`}
                >
                  {row.kind === 'command' ? (
                    <>
                      <span className="flex h-5 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-400">
                        <Icon name="zap" size={12} />
                      </span>
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
                        className={`w-12 shrink-0 rounded py-0.5 text-center text-[10px] font-bold ${METHOD_BADGE[row.entry.item.method]}`}
                      >
                        {SHORT[row.entry.item.method]}
                      </span>
                      <span className="truncate">{row.entry.item.name}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5 truncate text-zinc-500">
                        {row.entry.tag === 'pinned' && (
                          <Icon name="star" size={11} className="text-amber-400" />
                        )}
                        {row.entry.tag === 'recent' && <Icon name="clock" size={11} />}
                        {row.entry.where}
                      </span>
                    </>
                  )}
                  {selected && (
                    <kbd className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      ↵
                    </kbd>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-zinc-800 bg-zinc-950/40 px-4 py-2 text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-zinc-700 px-1">↑</kbd>
            <kbd className="rounded border border-zinc-700 px-1">↓</kbd>
            navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-zinc-700 px-1">↵</kbd>
            abrir
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="rounded border border-zinc-700 px-1">&gt;</kbd>
            solo acciones
          </span>
        </div>
      </div>
    </div>
  )
}
