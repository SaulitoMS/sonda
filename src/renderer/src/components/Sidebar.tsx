import { useEffect, useRef, useState } from 'react'
import type { CollectionItem, HttpMethod, RequestItem } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useRequestStore } from '../store/useRequestStore'
import { METHOD_COLORS } from '../lib/methodColors'
import { useTabsStore } from '../store/useTabsStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { ScopeAuthModal, type AuthScope } from './ScopeAuthModal'
import { ScopeHeadersModal, type HeadersScope } from './ScopeHeadersModal'
import { placeItem, type Place } from '../../../shared/reorder'

const SHORT: Record<HttpMethod, string> = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PAT',
  DELETE: 'DEL',
  HEAD: 'HEAD',
  OPTIONS: 'OPT'
}

/* ---------- Iconos ---------- */

const svgProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

function ChevronIcon({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      {...svgProps}
      width={12}
      height={12}
      className={`shrink-0 text-zinc-500 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function MenuIcon(): React.JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function FolderIcon({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg {...svgProps} className={open ? 'text-blue-400' : 'text-zinc-500'}>
      {open ? (
        <path d="m6 14 1.5-2.9A2 2 0 0 1 9.2 10H20a2 2 0 0 1 1.9 2.6l-1.6 5A2 2 0 0 1 18.4 19H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v2" />
      ) : (
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      )}
    </svg>
  )
}

function DuplicateButton({
  onClick,
  title
}: {
  onClick: () => void
  title: string
}): React.JSX.Element {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="hidden rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-blue-400 group-hover:block"
      title={title}
    >
      <svg {...svgProps} width={13} height={13}>
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  )
}

function TrashButton({
  onClick,
  title
}: {
  onClick: () => void
  title: string
}): React.JSX.Element {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="hidden rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-red-400 group-hover:block"
      title={title}
    >
      <svg {...svgProps} width={13} height={13}>
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg>
    </button>
  )
}

function PlayButton({ onClick, title }: { onClick: () => void; title: string }): React.JSX.Element {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="hidden rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-emerald-400 group-hover:block"
      title={title}
    >
      <svg {...svgProps} width={13} height={13}>
        <path d="m6 3 14 9-14 9z" />
      </svg>
    </button>
  )
}

function SyncButton({ onClick, title }: { onClick: () => void; title: string }): React.JSX.Element {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="hidden rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-blue-400 group-hover:block"
      title={title}
    >
      <svg {...svgProps} width={13} height={13}>
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M8 16H3v5" />
      </svg>
    </button>
  )
}

function LockButton({
  onClick,
  title,
  active
}: {
  onClick: () => void
  title: string
  /** true si ya tiene auth configurada: el candado se ve siempre */
  active: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`rounded p-0.5 hover:bg-zinc-700 hover:text-blue-400 ${
        active ? 'block text-blue-400 group-hover:block' : 'hidden text-zinc-500 group-hover:block'
      }`}
      title={title}
    >
      <svg {...svgProps} width={13} height={13}>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
    </button>
  )
}

function HeadersButton({
  onClick,
  title,
  active
}: {
  onClick: () => void
  title: string
  /** true si ya tiene headers configurados: el icono se ve siempre */
  active: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`rounded p-0.5 hover:bg-zinc-700 hover:text-blue-400 ${
        active ? 'block text-blue-400 group-hover:block' : 'hidden text-zinc-500 group-hover:block'
      }`}
      title={title}
    >
      <svg {...svgProps} width={13} height={13}>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    </button>
  )
}

function ExportButton({
  onClick,
  title
}: {
  onClick: () => void
  title: string
}): React.JSX.Element {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="hidden rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-amber-400 group-hover:block"
      title={title}
    >
      <svg {...svgProps} width={13} height={13}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 10 5 5 5-5" />
        <path d="M12 15V3" />
      </svg>
    </button>
  )
}

/* ---------- Fila de petición ---------- */

/** Qué se está arrastrando */
type DragItem =
  | { kind: 'request'; item: RequestItem }
  | { kind: 'folder'; collectionId: string; name: string }
  | { kind: 'collection'; id: string }

/** Una zona donde se puede soltar */
interface DropZone {
  /** Identifica la zona para resaltarla (coincide con dropTarget) */
  key: string
  /** ¿Esta zona se ocupa de lo que se arrastra? Si no, el evento sigue subiendo a la zona de arriba */
  handles: (d: DragItem) => boolean
  /** ¿Se puede soltar aquí? Si no, el cursor muestra que no se permite */
  accepts: (d: DragItem) => boolean
  onDrop: (d: DragItem) => void
}

/** Resaltado de la fila sobre la que se puede soltar */
const DROP_RING = 'bg-blue-500/10 ring-1 ring-inset ring-blue-400'

interface RowProps {
  item: RequestItem
  active: boolean
  onOpen: () => void
  onDelete: () => void
  onDuplicate: () => void
  onRename: (name: string) => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function RequestRow({
  item,
  active,
  onOpen,
  onDelete,
  onDuplicate,
  onRename,
  onDragStart,
  onDragEnd
}: RowProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name)
  const cancelled = useRef(false)

  const startEditing = (): void => {
    cancelled.current = false
    setDraft(item.name)
    setEditing(true)
  }

  // Enter y Escape solo quitan el foco; el guardado ocurre aquí, una única vez
  const finishEditing = (): void => {
    setEditing(false)
    const name = draft.trim()
    if (!cancelled.current && name && name !== item.name) onRename(name)
  }

  return (
    <div
      onClick={onOpen}
      draggable={!editing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors ${
        active
          ? 'bg-blue-500/15 text-zinc-100 ring-1 ring-inset ring-blue-500/30'
          : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
      }`}
    >
      <span className={`w-8 shrink-0 text-[10px] font-bold ${METHOD_COLORS[item.method]}`}>
        {SHORT[item.method]}
      </span>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={finishEditing}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              cancelled.current = true
              e.currentTarget.blur()
            }
          }}
          spellCheck={false}
          className="min-w-0 flex-1 rounded border border-blue-500 bg-zinc-800 px-1 py-0.5 text-xs text-zinc-100 outline-none"
        />
      ) : (
        <span
          className="flex-1 truncate"
          title={`${item.name} (doble clic para renombrar)`}
          onDoubleClick={(e) => {
            e.stopPropagation()
            startEditing()
          }}
        >
          {item.name}
        </span>
      )}
      <DuplicateButton onClick={onDuplicate} title="Duplicar" />
      <TrashButton onClick={onDelete} title="Eliminar" />
    </div>
  )
}

/* ---------- Sidebar ---------- */

/** Minúsculas y sin acentos, para que "autenticacion" encuentre "Autenticación" */
const norm = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

interface SidebarProps {
  onImport: () => void
  onRun: (collectionId: string) => void
  onSync: (collectionId: string, name: string) => void
}

export function Sidebar({ onImport, onRun, onSync }: SidebarProps): React.JSX.Element {
  const { collections, refresh } = useCollectionsStore()
  const currentFile = useRequestStore((s) => s.currentFile)

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [query, setQuery] = useState('')
  const [authScope, setAuthScope] = useState<AuthScope | null>(null)
  const [headersScope, setHeadersScope] = useState<HeadersScope | null>(null)
  // Lo que se arrastra vive en un ref: así los eventos de soltar no dependen de un re-render
  const dragRef = useRef<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // Línea azul que muestra si se soltará arriba o abajo de una fila
  const [dropLine, setDropLine] = useState<{ key: string; place: Place } | null>(null)

  useEffect(() => {
    refresh()
  }, [refresh])

  const toggle = (key: string): void => setExpanded((e) => ({ ...e, [key]: !e[key] }))

  const open = async (item: RequestItem): Promise<void> => {
    const saved = await window.api.readRequest(item.path)
    useTabsStore.getState().openSaved(saved, item.path)
  }

  const removeRequest = async (item: RequestItem): Promise<void> => {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return
    await window.api.deleteRequest(item.path)
    useTabsStore.getState().detachMatching((file) => file === item.path)
    await refresh()
  }

  const duplicateRequest = async (item: RequestItem): Promise<void> => {
    const saved = await window.api.readRequest(item.path)
    // La ruta es "coleccion/archivo.json" o "coleccion/carpeta/archivo.json"
    const parts = item.path.split('/')
    const newPath = await window.api.saveRequest({
      collectionId: parts[0],
      folder: parts.length > 2 ? parts[1] : undefined,
      request: { ...saved, name: `${saved.name} (copia)` }
    })
    await refresh()
    const copy = await window.api.readRequest(newPath)
    useTabsStore.getState().openSaved(copy, newPath)
  }

  const renameRequest = async (item: RequestItem, name: string): Promise<void> => {
    const saved = await window.api.readRequest(item.path)
    await window.api.saveRequest({ relPath: item.path, request: { ...saved, name } })
    await refresh()
    // Las pestañas abiertas con ese archivo recargan el nombre nuevo
    await useTabsStore.getState().refreshFiles([item.path])
  }

  const removeCollection = async (id: string, name: string): Promise<void> => {
    if (!confirm(`¿Eliminar la colección "${name}" y todas sus peticiones?`)) return
    await window.api.deleteCollection(id)
    useTabsStore.getState().detachMatching((file) => file.startsWith(`${id}/`))
    await refresh()
  }

  const createCollection = async (): Promise<void> => {
    if (!newName.trim()) return
    const created = await window.api.createCollection(newName.trim())
    setNewName('')
    setCreating(false)
    setExpanded((e) => ({ ...e, [created.id]: true }))
    await refresh()
  }

  const importPostman = async (): Promise<void> => {
    const result = await window.api.importPostman()
    if (!result) return
    if (!result.ok) {
      alert(result.error)
      return
    }
    await Promise.all([refresh(), useEnvironmentStore.getState().load()])
    setExpanded((e) => ({ ...e, [result.collectionId]: true }))
    if (result.warnings?.length) {
      alert(`Se importaron ${result.count} peticiones.\n\n${result.warnings.join('\n')}`)
    }
  }

  const exportPostman = async (id: string): Promise<void> => {
    const result = await window.api.exportPostman(id)
    if (!result) return
    if (!result.ok) {
      alert(result.error)
      return
    }
    alert(`Se exportaron ${result.count} peticiones a:\n${result.path}`)
  }

  /* ---------- Arrastrar y soltar ---------- */

  const failed = (err: unknown): void =>
    alert(err instanceof Error ? err.message : 'No se pudo mover')

  const startDrag = (e: React.DragEvent, item: DragItem, label: string): void => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', label)
    dragRef.current = item
  }

  const endDrag = (): void => {
    dragRef.current = null
    setDropTarget(null)
    setDropLine(null)
  }

  /** Eventos de una zona donde se puede soltar. Se evalúa al momento del evento, no al renderizar */
  const dropZone = (zone: DropZone): React.HTMLAttributes<HTMLDivElement> => {
    const over = (e: React.DragEvent): void => {
      const d = dragRef.current
      if (!d || !zone.handles(d)) return
      e.stopPropagation()
      if (!zone.accepts(d)) {
        setDropTarget((t) => (t === null ? t : null))
        return
      }
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget((t) => (t === zone.key ? t : zone.key))
    }

    return {
      onDragEnter: over,
      onDragOver: over,
      onDragLeave: (e) => {
        // Al pasar sobre un hijo también se dispara dragleave: se ignora
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDropTarget((t) => (t === zone.key ? null : t))
      },
      onDrop: (e) => {
        const d = dragRef.current
        if (!d || !zone.handles(d) || !zone.accepts(d)) return
        e.preventDefault()
        e.stopPropagation()
        endDrag()
        zone.onDrop(d)
      }
    }
  }

  const acceptsOnCollection = (c: CollectionItem, d: DragItem): boolean => {
    if (d.kind === 'request') {
      const parts = d.item.path.split('/')
      // Misma colección: solo tiene sentido si la petición está en una carpeta (pasa a la raíz)
      return parts[0] !== c.id || parts.length > 2
    }
    if (d.kind === 'folder') return d.collectionId !== c.id
    return d.id !== c.id
  }

  const acceptsOnFolder = (collectionId: string, folder: string, d: DragItem): boolean => {
    if (d.kind !== 'request') return false
    const parts = d.item.path.split('/')
    return !(parts.length > 2 && parts[0] === collectionId && parts[1] === folder)
  }

  const moveRequest = async (
    item: RequestItem,
    collectionId: string,
    folder: string | null
  ): Promise<string | null> => {
    try {
      const newPath = await window.api.moveRequest(item.path, collectionId, folder)
      useTabsStore.getState().remapFiles((file) => (file === item.path ? newPath : null))
      setExpanded((e) => ({
        ...e,
        [collectionId]: true,
        ...(folder ? { [`${collectionId}/${folder}`]: true } : {})
      }))
      await refresh()
      return newPath
    } catch (err) {
      failed(err)
      return null
    }
  }

  const moveFolder = async (
    fromCollection: string,
    folder: string,
    toCollection: string
  ): Promise<void> => {
    try {
      const newName = await window.api.moveFolder(fromCollection, folder, toCollection)
      const oldPrefix = `${fromCollection}/${folder}/`
      const newPrefix = `${toCollection}/${newName}/`
      useTabsStore
        .getState()
        .remapFiles((file) =>
          file.startsWith(oldPrefix) ? newPrefix + file.slice(oldPrefix.length) : null
        )
      setExpanded((e) => ({
        ...e,
        [toCollection]: true,
        [`${toCollection}/${newName}`]: true
      }))
      await refresh()
    } catch (err) {
      failed(err)
    }
  }

  /** La colección arrastrada toma el lugar de la colección sobre la que se suelta */
  const reorderCollection = async (draggedId: string, targetId: string): Promise<void> => {
    const ids = collections.map((c) => c.id)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    if (from === -1 || to === -1) return
    ids.splice(from, 1)
    ids.splice(to, 0, draggedId)
    try {
      await window.api.reorderCollections(ids)
      await refresh()
    } catch (err) {
      failed(err)
    }
  }

  /* ---------- Reordenar carpetas y peticiones ---------- */

  const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
  const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

  /** Nombres (carpetas y archivos) de un directorio, en el orden en que se ven */
  const namesIn = (collectionId: string, folder: string | null): string[] => {
    const c = collections.find((x) => x.id === collectionId)
    if (!c) return []
    if (folder) {
      return c.folders.find((f) => f.name === folder)?.requests.map((r) => fileName(r.path)) ?? []
    }
    return [...c.folders.map((f) => f.name), ...c.requests.map((r) => fileName(r.path))]
  }

  /** Suelta una petición arriba o abajo de otra; si venía de otra carpeta, primero la mueve */
  const dropRequestAt = async (
    dragged: RequestItem,
    target: RequestItem,
    place: Place
  ): Promise<void> => {
    const parts = target.path.split('/')
    const collectionId = parts[0]
    const folder = parts.length > 2 ? parts[1] : null

    try {
      let draggedFile = fileName(dragged.path)
      if (dirOf(dragged.path) !== dirOf(target.path)) {
        const newPath = await moveRequest(dragged, collectionId, folder)
        if (!newPath) return
        draggedFile = fileName(newPath)
      }
      const next = placeItem(
        namesIn(collectionId, folder),
        draggedFile,
        fileName(target.path),
        place
      )
      if (next) await window.api.reorderItems(collectionId, folder, next)
      await refresh()
    } catch (err) {
      failed(err)
    }
  }

  /** Suelta una carpeta arriba o abajo de otra de la misma colección */
  const dropFolderAt = async (
    collectionId: string,
    dragged: string,
    target: string,
    place: Place
  ): Promise<void> => {
    const next = placeItem(namesIn(collectionId, null), dragged, target, place)
    if (!next) return
    try {
      await window.api.reorderItems(collectionId, null, next)
      await refresh()
    } catch (err) {
      failed(err)
    }
  }

  /** Eventos de una fila donde se puede soltar "arriba" o "abajo" de ella */
  const rowDrop = (row: {
    key: string
    accepts: (d: DragItem) => boolean
    onDrop: (d: DragItem, place: Place) => void
  }): React.HTMLAttributes<HTMLDivElement> => {
    const placeOf = (e: React.DragEvent): Place => {
      const rect = e.currentTarget.getBoundingClientRect()
      return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    }

    const over = (e: React.DragEvent): void => {
      const d = dragRef.current
      if (!d || !row.accepts(d)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      const place = placeOf(e)
      setDropTarget(null)
      setDropLine((l) => (l?.key === row.key && l.place === place ? l : { key: row.key, place }))
    }

    return {
      onDragEnter: over,
      onDragOver: over,
      onDragLeave: (e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDropLine((l) => (l?.key === row.key ? null : l))
      },
      onDrop: (e) => {
        const d = dragRef.current
        if (!d || !row.accepts(d)) return
        e.preventDefault()
        e.stopPropagation()
        const place = placeOf(e)
        endDrag()
        row.onDrop(d, place)
      }
    }
  }

  const requestRowDrop = (target: RequestItem): React.HTMLAttributes<HTMLDivElement> =>
    rowDrop({
      key: `r:${target.path}`,
      accepts: (d) => d.kind === 'request' && d.item.path !== target.path,
      onDrop: (d, place) => {
        if (d.kind === 'request') void dropRequestAt(d.item, target, place)
      }
    })

  const folderRowDrop = (
    collectionId: string,
    name: string
  ): React.HTMLAttributes<HTMLDivElement> =>
    rowDrop({
      key: `fo:${collectionId}/${name}`,
      accepts: (d) => d.kind === 'folder' && d.collectionId === collectionId && d.name !== name,
      onDrop: (d, place) => {
        if (d.kind === 'folder') void dropFolderAt(collectionId, d.name, name, place)
      }
    })

  /** La línea azul que marca dónde caerá lo que se arrastra */
  const dropLineFor = (key: string): React.JSX.Element | null =>
    dropLine?.key === key ? (
      <div
        className={`pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded bg-blue-400 ${
          dropLine.place === 'before' ? '-top-[2px]' : '-bottom-[2px]'
        }`}
      />
    ) : null

  /** Toda la colección (encabezado y contenido) acepta peticiones, carpetas y otras colecciones */
  const collectionZone = (c: CollectionItem): React.HTMLAttributes<HTMLDivElement> =>
    dropZone({
      key: `c:${c.id}`,
      handles: () => true,
      accepts: (d) => acceptsOnCollection(c, d),
      onDrop: (d) => {
        if (d.kind === 'request') void moveRequest(d.item, c.id, null)
        else if (d.kind === 'folder') void moveFolder(d.collectionId, d.name, c.id)
        else void reorderCollection(d.id, c.id)
      }
    })

  /** Toda la carpeta (encabezado y peticiones) acepta peticiones. Lo demás sube a la colección */
  const folderZone = (collectionId: string, folder: string): React.HTMLAttributes<HTMLDivElement> =>
    dropZone({
      key: `f:${collectionId}/${folder}`,
      handles: (d) => d.kind === 'request',
      accepts: (d) => acceptsOnFolder(collectionId, folder, d),
      onDrop: (d) => {
        if (d.kind === 'request') void moveRequest(d.item, collectionId, folder)
      }
    })

  // Búsqueda: cada palabra debe aparecer en el método, el nombre o la ruta (colección/carpeta)
  const terms = norm(query).split(/\s+/).filter(Boolean)
  const searching = terms.length > 0
  const matches = (r: RequestItem): boolean => {
    const haystack = norm(`${r.method} ${r.name} ${r.path}`)
    return terms.every((t) => haystack.includes(t))
  }

  const shown = collections
    .map((c) => {
      if (!searching) return { c, requests: c.requests, folders: c.folders }
      return {
        c,
        requests: c.requests.filter(matches),
        folders: c.folders
          .map((f) => ({ ...f, requests: f.requests.filter(matches) }))
          .filter((f) => f.requests.length > 0)
      }
    })
    .filter((x) => !searching || x.requests.length + x.folders.length > 0)

  return (
    <aside className="flex w-full min-w-0 flex-col bg-zinc-950/40">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
          Colecciones
        </span>
        <div className="flex gap-0.5">
          <button
            onClick={onImport}
            className="rounded px-1.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            title="Importar Swagger / OpenAPI"
          >
            ⇣ Swagger
          </button>
          <button
            onClick={importPostman}
            className="rounded px-1.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            title="Importar colección de Postman (.json) o captura HAR (.har)"
          >
            ⇣ Postman
          </button>
          <button
            onClick={() => setCreating(true)}
            className="rounded px-1.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            title="Nueva colección"
          >
            +
          </button>
        </div>
      </div>

      <div className="border-b border-zinc-800 p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
          placeholder="Buscar peticiones…"
          spellCheck={false}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {creating && (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createCollection()
              if (e.key === 'Escape') setCreating(false)
            }}
            onBlur={() => setCreating(false)}
            placeholder="Nombre y Enter"
            className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
          />
        )}

        {collections.length === 0 && !creating && (
          <p className="p-2 text-xs text-zinc-500">
            Aún no tienes colecciones. Importa un Swagger o crea una con +.
          </p>
        )}

        {searching && shown.length === 0 && (
          <p className="p-2 text-xs text-zinc-500">Sin resultados para «{query.trim()}».</p>
        )}

        {shown.map(({ c, requests, folders }) => {
          const total = requests.length + folders.reduce((n, f) => n + f.requests.length, 0)
          // Al buscar, todo se muestra abierto para ver las coincidencias
          const isOpen = searching || !!expanded[c.id]

          return (
            <div key={c.id} className="mb-1.5" {...collectionZone(c)}>
              {/* Colección (padre) */}
              <div
                onClick={() => toggle(c.id)}
                draggable
                onDragStart={(e) => startDrag(e, { kind: 'collection', id: c.id }, c.name)}
                onDragEnd={endDrag}
                className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors hover:bg-zinc-800/70 ${
                  isOpen ? 'bg-zinc-800/40 text-zinc-100' : 'text-zinc-200'
                } ${dropTarget === `c:${c.id}` ? DROP_RING : ''}`}
              >
                <ChevronIcon open={isOpen} />
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-500/15 text-blue-400">
                  <MenuIcon />
                </span>
                <span className="flex-1 truncate" title={c.baseUrl ?? c.name}>
                  {c.name}
                </span>
                <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 group-hover:hidden">
                  {total}
                </span>
                <LockButton
                  active={!!c.auth && c.auth.type !== 'none'}
                  onClick={() =>
                    setAuthScope({ collectionId: c.id, collectionName: c.name, auth: c.auth })
                  }
                  title="Autenticación de la colección"
                />
                <HeadersButton
                  active={!!c.headers?.length}
                  onClick={() =>
                    setHeadersScope({
                      collectionId: c.id,
                      collectionName: c.name,
                      headers: c.headers
                    })
                  }
                  title="Headers de la colección"
                />
                {c.source && (
                  <SyncButton
                    onClick={() => onSync(c.id, c.name)}
                    title="Sincronizar con la spec"
                  />
                )}
                {total > 0 && (
                  <ExportButton onClick={() => exportPostman(c.id)} title="Exportar a Postman" />
                )}
                {total > 0 && (
                  <PlayButton onClick={() => onRun(c.id)} title="Ejecutar todas las peticiones" />
                )}

                <TrashButton
                  onClick={() => removeCollection(c.id, c.name)}
                  title="Eliminar colección"
                />
              </div>

              {/* Hijos, unidos al padre con una línea guía */}
              {isOpen && (
                <div className="ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l border-zinc-800 pl-2">
                  {folders.map((f) => {
                    const key = `${c.id}/${f.name}`
                    const folderOpen = searching || !!expanded[key]

                    return (
                      <div key={key} {...folderZone(c.id, f.name)}>
                        <div
                          onClick={() => toggle(key)}
                          draggable
                          onDragStart={(e) =>
                            startDrag(
                              e,
                              { kind: 'folder', collectionId: c.id, name: f.name },
                              f.name
                            )
                          }
                          onDragEnd={endDrag}
                          {...folderRowDrop(c.id, f.name)}
                          className={`group relative flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70 ${
                            dropTarget === `f:${key}` ? DROP_RING : ''
                          }`}
                        >
                          <ChevronIcon open={folderOpen} />
                          <FolderIcon open={folderOpen} />
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="text-[10px] text-zinc-600 group-hover:hidden">
                            {f.requests.length}
                          </span>
                          <LockButton
                            active={!!f.auth && f.auth.type !== 'inherit'}
                            onClick={() =>
                              setAuthScope({
                                collectionId: c.id,
                                collectionName: c.name,
                                folder: f.name,
                                auth: f.auth
                              })
                            }
                            title="Autenticación de la carpeta"
                          />
                          <HeadersButton
                            active={!!f.headers?.length}
                            onClick={() =>
                              setHeadersScope({
                                collectionId: c.id,
                                collectionName: c.name,
                                folder: f.name,
                                headers: f.headers
                              })
                            }
                            title="Headers de la carpeta"
                          />

                          {dropLineFor(`fo:${key}`)}
                        </div>

                        {folderOpen && (
                          <div className="ml-[13px] mt-0.5 flex flex-col gap-0.5 border-l border-zinc-800 pl-2">
                            {f.requests.map((r) => (
                              <div key={r.path} {...requestRowDrop(r)} className="relative">
                                <RequestRow
                                  item={r}
                                  active={currentFile === r.path}
                                  onOpen={() => open(r)}
                                  onDelete={() => removeRequest(r)}
                                  onDuplicate={() => duplicateRequest(r)}
                                  onRename={(name) => renameRequest(r, name)}
                                  onDragStart={(e) =>
                                    startDrag(e, { kind: 'request', item: r }, r.path)
                                  }
                                  onDragEnd={endDrag}
                                />
                                {dropLineFor(`r:${r.path}`)}
                              </div>
                            ))}
                            {f.requests.length === 0 && (
                              <p className="px-2 py-1 text-xs text-zinc-600">Vacía</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {requests.map((r) => (
                    <div key={r.path} {...requestRowDrop(r)} className="relative">
                      <RequestRow
                        item={r}
                        active={currentFile === r.path}
                        onOpen={() => open(r)}
                        onDelete={() => removeRequest(r)}
                        onDuplicate={() => duplicateRequest(r)}
                        onRename={(name) => renameRequest(r, name)}
                        onDragStart={(e) => startDrag(e, { kind: 'request', item: r }, r.path)}
                        onDragEnd={endDrag}
                      />
                      {dropLineFor(`r:${r.path}`)}
                    </div>
                  ))}

                  {total === 0 && <p className="px-2 py-1 text-xs text-zinc-600">Vacía</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={() => window.api.openWorkspace()}
        className="border-t border-zinc-800 px-3 py-2 text-left text-xs text-zinc-500 hover:text-zinc-300"
      >
        Abrir carpeta en Finder
      </button>

      {authScope && <ScopeAuthModal scope={authScope} onClose={() => setAuthScope(null)} />}
      {headersScope && (
        <ScopeHeadersModal scope={headersScope} onClose={() => setHeadersScope(null)} />
      )}
    </aside>
  )
}
