import { useEffect, useRef } from 'react'
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

export function TabsBar(): React.JSX.Element {
  const tabs = useTabsStore((s) => s.tabs)
  const activeId = useTabsStore((s) => s.activeId)
  const select = useTabsStore((s) => s.select)
  const newTab = useTabsStore((s) => s.newTab)
  const close = useTabsStore((s) => s.close)
  const strip = useRef<HTMLDivElement>(null)

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

  // La rueda vertical del ratón desplaza las pestañas en horizontal
  const onWheel = (e: React.WheelEvent): void => {
    if (strip.current && e.deltaY && !e.deltaX) strip.current.scrollLeft += e.deltaY
  }

  const requestClose = (id: string, label: string, dirty: boolean): void => {
    if (dirty && !confirm(`"${label}" tiene cambios sin guardar. ¿Cerrar sin guardar?`)) return
    close(id)
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
    </div>
  )
}
