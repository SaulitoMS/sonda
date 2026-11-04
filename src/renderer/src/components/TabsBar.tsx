import { useEffect, useRef, useState } from 'react'
import { isDirtyState } from '../../../shared/dirty'
import { tabLabel } from '../../../shared/tabs'
import type { HttpMethod } from '../../../shared/types'
import { METHOD_COLORS } from '../lib/methodColors'
import { useRequestStore } from '../store/useRequestStore'
import { useTabsStore } from '../store/useTabsStore'
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

interface TabMenu {
  x: number
  y: number
  id: string
  label: string
  dirty: boolean
}

export function TabsBar(): React.JSX.Element {
  const tabs = useTabsStore((s) => s.tabs)
  const activeId = useTabsStore((s) => s.activeId)
  const select = useTabsStore((s) => s.select)
  const newTab = useTabsStore((s) => s.newTab)
  const close = useTabsStore((s) => s.close)
  const duplicate = useTabsStore((s) => s.duplicate)
  const closeOthers = useTabsStore((s) => s.closeOthers)
  const strip = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<TabMenu | null>(null)

  // La pestaña activa se lee en vivo; las demás, de su foto
  const liveName = useRequestStore((s) => s.name)
  const liveUrl = useRequestStore((s) => s.url)
  const liveMethod = useRequestStore((s) => s.method)
  const liveLoading = useRequestStore((s) => s.loading)
  const liveDirty = useRequestStore((s) => isDirtyState(s))

  // Mantiene a la vista la pestaña activa (al abrir una nueva o cambiar con muchas abiertas)
  useEffect(() => {
    strip.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeId, tabs.length])

  // El menú contextual se cierra con cualquier clic, con Escape o al desplazar
  useEffect(() => {
    if (!menu) return
    const hide = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', hide)
    window.addEventListener('blur', hide)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', hide)
      window.removeEventListener('blur', hide)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // La rueda vertical del ratón desplaza las pestañas en horizontal
  const onWheel = (e: React.WheelEvent): void => {
    if (strip.current && e.deltaY && !e.deltaX) strip.current.scrollLeft += e.deltaY
  }

  const requestClose = (id: string, label: string, dirty: boolean): void => {
    if (dirty && !confirm(`"${label}" tiene cambios sin guardar. ¿Cerrar sin guardar?`)) return
    close(id)
  }

  const requestCloseOthers = (id: string): void => {
    const dirtyOthers = tabs.filter(
      (t) =>
        t.id !== id &&
        (t.id === activeId ? liveDirty : t.snapshot ? isDirtyState(t.snapshot) : false)
    ).length
    if (
      dirtyOthers > 0 &&
      !confirm(
        `Hay ${dirtyOthers} pestaña(s) con cambios sin guardar. ¿Cerrarlas sin guardar?\n(Podrás recuperarlas con "Reabrir pestaña cerrada".)`
      )
    )
      return
    closeOthers(id)
  }

  return (
    <div className="flex min-w-0 flex-1 items-stretch">
      <div
        ref={strip}
        onWheel={onWheel}
        role="tablist"
        className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]"
      >
        {tabs.map((t) => {
          const active = t.id === activeId
          const view = active
            ? {
                name: liveName,
                url: liveUrl,
                method: liveMethod,
                loading: liveLoading,
                dirty: liveDirty
              }
            : {
                name: t.snapshot?.name ?? '',
                url: t.snapshot?.url ?? '',
                method: t.snapshot?.method ?? ('GET' as HttpMethod),
                loading: t.snapshot?.loading ?? false,
                dirty: t.snapshot ? isDirtyState(t.snapshot) : false
              }
          const label = tabLabel(view)

          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => select(t.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, id: t.id, label, dirty: view.dirty })
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  requestClose(t.id, label, view.dirty)
                }
              }}
              className={`group relative flex min-w-28 max-w-52 shrink-0 cursor-pointer items-center gap-2 border-r border-zinc-800/70 px-3 text-xs transition-colors ${
                active
                  ? 'bg-zinc-900 text-zinc-100 after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:bg-blue-500'
                  : 'text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300'
              }`}
            >
              <span className={`shrink-0 text-[10px] font-bold ${METHOD_COLORS[view.method]}`}>
                {SHORT[view.method]}
              </span>
              <span className="min-w-0 flex-1 truncate" title={label}>
                {label}
              </span>
              {view.loading && (
                <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
              )}
              {/* Con cambios sin guardar se ve un punto; al pasar el cursor, la ✕ */}
              {view.dirty && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 group-hover:hidden"
                  title="Cambios sin guardar"
                />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  requestClose(t.id, label, view.dirty)
                }}
                className={`shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-100 ${
                  view.dirty
                    ? 'hidden group-hover:block'
                    : active
                      ? ''
                      : 'invisible group-hover:visible'
                }`}
                title="Cerrar pestaña"
                aria-label="Cerrar pestaña"
              >
                <Icon name="x" size={12} />
              </button>
            </div>
          )
        })}
      </div>

      <button
        onClick={newTab}
        className="mx-1 shrink-0 self-center rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        title="Nueva pestaña"
        aria-label="Nueva pestaña"
      >
        <Icon name="plus" size={15} />
      </button>

      {menu && (
        <div
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            left: Math.min(menu.x, window.innerWidth - 200),
            top: Math.min(menu.y, window.innerHeight - 130)
          }}
          className="anim-pop fixed z-50 w-48 rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl"
        >
          {[
            {
              id: 'duplicate',
              label: 'Duplicar pestaña',
              disabled: false,
              run: () => duplicate(menu.id)
            },
            {
              id: 'close',
              label: 'Cerrar pestaña',
              disabled: false,
              run: () => requestClose(menu.id, menu.label, menu.dirty)
            },
            {
              id: 'others',
              label: 'Cerrar las demás',
              disabled: tabs.length < 2,
              run: () => requestCloseOthers(menu.id)
            }
          ].map((item) => (
            <button
              key={item.id}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setMenu(null)
                item.run()
              }}
              className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
