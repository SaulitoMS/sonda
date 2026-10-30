import { useEffect, useMemo, useRef, useState } from 'react'
import type { RequestItem } from '../../../shared/types'
import { METHOD_COLORS } from '../lib/methodColors'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useTabsStore } from '../store/useTabsStore'

interface Entry {
  item: RequestItem
  /** "Colección / carpeta" */
  where: string
}

interface Props {
  onClose: () => void
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

export function CommandPalette({ onClose }: Props): React.JSX.Element {
  const collections = useCollectionsStore((s) => s.collections)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<Entry[]>(() => {
    const all: Entry[] = []
    for (const c of collections) {
      for (const r of c.requests) all.push({ item: r, where: c.name })
      for (const f of c.folders) {
        for (const r of f.requests) all.push({ item: r, where: `${c.name} / ${f.name}` })
      }
    }
    return all
  }, [collections])

  const results = useMemo(() => {
    return entries
      .map((e) => ({
        e,
        score: Math.max(
          fuzzyScore(e.item.name, query),
          fuzzyScore(`${e.item.method} ${e.where} ${e.item.name}`, query) / 2
        )
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((r) => r.e)
  }, [entries, query])

  // Mantiene visible la fila seleccionada
  useEffect(() => {
    const el = listRef.current?.children[index] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const open = async (entry: Entry | undefined): Promise<void> => {
    if (!entry) return
    const saved = await window.api.readRequest(entry.item.path)
    useTabsStore.getState().openSaved(saved, entry.item.path)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void open(results[index])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[15vh]"
      onMouseDown={onClose}
    >
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
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
          placeholder="Buscar petición por nombre, método o colección…"
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-zinc-500">Sin resultados</p>
          )}
          {results.map((r, i) => (
            <div
              key={r.item.path}
              onMouseEnter={() => setIndex(i)}
              onClick={() => void open(r)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-1.5 text-xs ${
                i === index ? 'bg-blue-500/15 text-zinc-100' : 'text-zinc-300'
              }`}
            >
              <span className={`w-10 shrink-0 font-bold ${METHOD_COLORS[r.item.method]}`}>
                {r.item.method === 'PATCH' ? 'PAT' : r.item.method.slice(0, 4)}
              </span>
              <span className="truncate">{r.item.name}</span>
              <span className="ml-auto shrink-0 truncate text-zinc-500">{r.where}</span>
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
