import { useEffect, useState } from 'react'
import type { HttpMethod, RequestItem } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useRequestStore } from '../store/useRequestStore'
import { METHOD_COLORS } from '../lib/methodColors'

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

/* ---------- Fila de petición ---------- */

interface RowProps {
  item: RequestItem
  active: boolean
  onOpen: () => void
  onDelete: () => void
}

function RequestRow({ item, active, onOpen, onDelete }: RowProps): React.JSX.Element {
  return (
    <div
      onClick={onOpen}
      className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors ${
        active
          ? 'bg-blue-500/15 text-zinc-100 ring-1 ring-inset ring-blue-500/30'
          : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
      }`}
    >
      <span className={`w-8 shrink-0 text-[10px] font-bold ${METHOD_COLORS[item.method]}`}>
        {SHORT[item.method]}
      </span>
      <span className="flex-1 truncate" title={item.name}>
        {item.name}
      </span>
      <TrashButton onClick={onDelete} title="Eliminar" />
    </div>
  )
}

/* ---------- Sidebar ---------- */

interface SidebarProps {
  onImport: () => void
  onRun: (collectionId: string) => void
}

export function Sidebar({ onImport, onRun }: SidebarProps): React.JSX.Element {
  const { collections, refresh } = useCollectionsStore()
  const currentFile = useRequestStore((s) => s.currentFile)
  const loadSaved = useRequestStore((s) => s.loadSaved)
  const detach = useRequestStore((s) => s.detach)

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    refresh()
  }, [refresh])

  const toggle = (key: string): void => setExpanded((e) => ({ ...e, [key]: !e[key] }))

  const open = async (item: RequestItem): Promise<void> => {
    loadSaved(await window.api.readRequest(item.path), item.path)
  }

  const removeRequest = async (item: RequestItem): Promise<void> => {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return
    await window.api.deleteRequest(item.path)
    if (currentFile === item.path) detach()
    await refresh()
  }

  const removeCollection = async (id: string, name: string): Promise<void> => {
    if (!confirm(`¿Eliminar la colección "${name}" y todas sus peticiones?`)) return
    await window.api.deleteCollection(id)
    if (currentFile?.startsWith(`${id}/`)) detach()
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

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950/40">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
          Colecciones
        </span>
        <div className="flex gap-1">
          <button
            onClick={onImport}
            className="rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            title="Importar Swagger / OpenAPI"
          >
            ⇣ Swagger
          </button>
          <button
            onClick={() => setCreating(true)}
            className="rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            title="Nueva colección"
          >
            +
          </button>
        </div>
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

        {collections.map((c) => {
          const total = c.requests.length + c.folders.reduce((n, f) => n + f.requests.length, 0)
          const isOpen = !!expanded[c.id]

          return (
            <div key={c.id} className="mb-1.5">
              {/* Colección (padre) */}
              <div
                onClick={() => toggle(c.id)}
                className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors hover:bg-zinc-800/70 ${
                  isOpen ? 'bg-zinc-800/40 text-zinc-100' : 'text-zinc-200'
                }`}
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
                  {c.folders.map((f) => {
                    const key = `${c.id}/${f.name}`
                    const folderOpen = !!expanded[key]

                    return (
                      <div key={key}>
                        <div
                          onClick={() => toggle(key)}
                          className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800/70"
                        >
                          <ChevronIcon open={folderOpen} />
                          <FolderIcon open={folderOpen} />
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="text-[10px] text-zinc-600">{f.requests.length}</span>
                        </div>

                        {folderOpen && (
                          <div className="ml-[13px] mt-0.5 flex flex-col gap-0.5 border-l border-zinc-800 pl-2">
                            {f.requests.map((r) => (
                              <RequestRow
                                key={r.path}
                                item={r}
                                active={currentFile === r.path}
                                onOpen={() => open(r)}
                                onDelete={() => removeRequest(r)}
                              />
                            ))}
                            {f.requests.length === 0 && (
                              <p className="px-2 py-1 text-xs text-zinc-600">Vacía</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {c.requests.map((r) => (
                    <RequestRow
                      key={r.path}
                      item={r}
                      active={currentFile === r.path}
                      onOpen={() => open(r)}
                      onDelete={() => removeRequest(r)}
                    />
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
    </aside>
  )
}