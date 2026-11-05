import { useEffect, useMemo, useState } from 'react'
import type { RequestItem, SavedRequest } from '../../../shared/types'
import {
  makeMatcher,
  replaceInRequest,
  REPLACE_SCOPES,
  type FindReplaceOptions,
  type ReplaceScope
} from '../../../shared/findReplace'
import { METHOD_COLORS } from '../lib/methodColors'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useRequestStore } from '../store/useRequestStore'
import { useTabsStore } from '../store/useTabsStore'
import { Modal } from './Modal'

interface Row {
  item: RequestItem
  group: string
  saved: SavedRequest
}

const inputClass =
  'rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500'

const clip = (s: string, n = 140): string => (s.length > n ? `${s.slice(0, n)}…` : s)

export function FindReplaceModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const collections = useCollectionsStore((s) => s.collections)
  const currentFile = useRequestStore((s) => s.currentFile)

  const [collectionId, setCollectionId] = useState(() => {
    const id = currentFile?.split('/')[0] ?? ''
    return collections.some((c) => c.id === id) ? id : (collections[0]?.id ?? '')
  })
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [scopes, setScopes] = useState<ReplaceScope[]>(['url', 'headers', 'body', 'auth'])
  const [excluded, setExcluded] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [undo, setUndo] = useState<{ path: string; saved: SavedRequest }[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  // Las peticiones se leen del disco; la clave evita mostrar datos de otra colección mientras carga
  const loadKey = `${collectionId}:${reloadKey}`
  const [loaded, setLoaded] = useState<{ key: string; rows: Row[] } | null>(null)
  const rows = loaded?.key === loadKey ? loaded.rows : null

  useEffect(() => {
    let cancelled = false
    const collection = collections.find((c) => c.id === collectionId)
    const entries = collection
      ? [
          ...collection.folders.flatMap((f) => f.requests.map((item) => ({ item, group: f.name }))),
          ...collection.requests.map((item) => ({ item, group: '' }))
        ]
      : []
    Promise.all(
      entries.map(async ({ item, group }): Promise<Row | null> => {
        try {
          return { item, group, saved: await window.api.readRequest(item.path) }
        } catch {
          return null // un archivo ilegible no debe tumbar la búsqueda
        }
      })
    ).then((all) => {
      if (!cancelled) setLoaded({ key: loadKey, rows: all.filter((r): r is Row => r !== null) })
    })
    return () => {
      cancelled = true
    }
  }, [collections, collectionId, loadKey])

  const matcher = useMemo(
    () => makeMatcher({ find, replace, caseSensitive, useRegex }),
    [find, replace, caseSensitive, useRegex]
  )
  const opts = useMemo<FindReplaceOptions>(
    () => ({ find, replace, caseSensitive, useRegex, scopes }),
    [find, replace, caseSensitive, useRegex, scopes]
  )

  const hits = useMemo(
    () =>
      !rows || !matcher.ok
        ? []
        : rows
            .map((row) => ({ row, result: replaceInRequest(row.saved, opts) }))
            .filter((h) => h.result.count > 0),
    [rows, matcher.ok, opts]
  )
  const selected = hits.filter((h) => !excluded.includes(h.row.item.path))
  const totalCount = selected.reduce((n, h) => n + h.result.count, 0)

  const toggleScope = (id: ReplaceScope): void =>
    setScopes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const toggleRow = (path: string): void =>
    setExcluded((e) => (e.includes(path) ? e.filter((p) => p !== path) : [...e, path]))

  const apply = async (): Promise<void> => {
    if (selected.length === 0) return
    setBusy(true)
    setMessage('')
    const done: Row[] = []
    const failed: string[] = []
    for (const h of selected) {
      try {
        await window.api.saveRequest({ relPath: h.row.item.path, request: h.result.request })
        done.push(h.row)
      } catch {
        failed.push(h.row.item.name)
      }
    }
    // Las pestañas abiertas sin cambios propios se recargan; las que tienen cambios sin guardar no
    await useTabsStore.getState().refreshFiles(done.map((r) => r.item.path))
    setUndo(done.map((r) => ({ path: r.item.path, saved: r.saved })))
    setExcluded([])
    setReloadKey((k) => k + 1)
    setBusy(false)
    setMessage(
      `Reemplazado en ${done.length} ${done.length === 1 ? 'petición' : 'peticiones'}` +
        (failed.length ? `. No se pudo guardar: ${failed.join(', ')}` : '')
    )
  }

  const undoLast = async (): Promise<void> => {
    setBusy(true)
    const failed: string[] = []
    for (const u of undo) {
      try {
        await window.api.saveRequest({ relPath: u.path, request: u.saved })
      } catch {
        failed.push(u.path)
      }
    }
    await useTabsStore.getState().refreshFiles(undo.map((u) => u.path))
    setUndo([])
    setReloadKey((k) => k + 1)
    setBusy(false)
    setMessage(
      failed.length ? `No se pudieron restaurar ${failed.length} archivos` : 'Cambios deshechos'
    )
  }

  const check = 'flex cursor-pointer items-center gap-1.5 text-xs text-zinc-300'

  return (
    <Modal title="Buscar y reemplazar" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>Colección</span>
          <select
            value={collectionId}
            onChange={(e) => {
              setCollectionId(e.target.value)
              setExcluded([])
              setUndo([])
              setMessage('')
            }}
            className={`${inputClass} font-sans`}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <input
            autoFocus
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Buscar…"
            spellCheck={false}
            className={`${inputClass} min-w-0 flex-1`}
          />
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            placeholder="Reemplazar por…"
            spellCheck={false}
            className={`${inputClass} min-w-0 flex-1`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <label className={check}>
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="accent-blue-500"
            />
            Distinguir mayúsculas
          </label>
          <label className={check}>
            <input
              type="checkbox"
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
              className="accent-blue-500"
            />
            Expresión regular
          </label>
          <span className="h-4 w-px bg-zinc-800" />
          {REPLACE_SCOPES.map((s) => (
            <label key={s.id} className={check}>
              <input
                type="checkbox"
                checked={scopes.includes(s.id)}
                onChange={() => toggleScope(s.id)}
                className="accent-blue-500"
              />
              {s.label}
            </label>
          ))}
        </div>

        {!matcher.ok && matcher.error && (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
            {matcher.error}
          </p>
        )}

        <div className="max-h-[38vh] min-h-24 overflow-auto rounded-md border border-zinc-800">
          {!rows ? (
            <p className="py-6 text-center text-xs text-zinc-500">Cargando peticiones…</p>
          ) : !find ? (
            <p className="py-6 text-center text-xs text-zinc-500">
              Escribe qué buscar. {rows.length} peticiones en esta colección.
            </p>
          ) : hits.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">Sin coincidencias.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {hits.map(({ row, result }) => {
                const on = !excluded.includes(row.item.path)
                return (
                  <li key={row.item.path} className={`p-2 text-xs ${on ? '' : 'opacity-50'}`}>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleRow(row.item.path)}
                        className="accent-blue-500"
                      />
                      <span className={`w-10 shrink-0 font-bold ${METHOD_COLORS[row.item.method]}`}>
                        {row.item.method === 'PATCH' ? 'PAT' : row.item.method.slice(0, 4)}
                      </span>
                      <span className="truncate text-zinc-200">{row.item.name}</span>
                      {row.group && <span className="truncate text-zinc-500">{row.group}</span>}
                      <span className="ml-auto shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400">
                        {result.count}
                      </span>
                    </label>
                    <div className="mt-1 space-y-1 pl-6 font-mono text-[11px]">
                      {result.changes.slice(0, 3).map((c, i) => (
                        <div key={i}>
                          <div className="text-zinc-500">{c.field}</div>
                          <div className="break-all text-red-300/80 line-through">
                            {clip(c.before)}
                          </div>
                          <div className="break-all text-emerald-300">{clip(c.after)}</div>
                        </div>
                      ))}
                      {result.changes.length > 3 && (
                        <div className="text-zinc-500">
                          +{result.changes.length - 3} cambios más en esta petición
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-zinc-500">
          Se modifican los archivos de la colección. Si tienes una de estas peticiones abierta con
          cambios sin guardar, esa pestaña no se actualiza.
        </p>

        {message && (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
            {message}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {undo.length > 0 && (
          <button
            onClick={() => void undoLast()}
            disabled={busy}
            className="mr-auto rounded-md bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            Deshacer el último reemplazo
          </button>
        )}
        <button
          onClick={onClose}
          className="btn btn-ghost"
        >
          Cerrar
        </button>
        <button
          onClick={() => void apply()}
          disabled={busy || selected.length === 0}
          className="btn btn-primary"
        >
          {selected.length === 0
            ? 'Reemplazar'
            : `Reemplazar ${totalCount} en ${selected.length} ${
                selected.length === 1 ? 'petición' : 'peticiones'
              }`}
        </button>
      </div>
    </Modal>
  )
}
