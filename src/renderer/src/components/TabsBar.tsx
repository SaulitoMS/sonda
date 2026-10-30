import { tabLabel } from '../../../shared/tabs'
import type { HttpMethod } from '../../../shared/types'
import { METHOD_COLORS } from '../lib/methodColors'
import { useRequestStore } from '../store/useRequestStore'
import { useTabsStore } from '../store/useTabsStore'

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

  // La pestaña activa se lee en vivo; las demás, de su foto
  const liveName = useRequestStore((s) => s.name)
  const liveUrl = useRequestStore((s) => s.url)
  const liveMethod = useRequestStore((s) => s.method)
  const liveLoading = useRequestStore((s) => s.loading)

  return (
    <div className="flex min-w-0 flex-1 items-stretch">
      <div className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]">
        {tabs.map((t) => {
          const active = t.id === activeId
          const view = active
            ? { name: liveName, url: liveUrl, method: liveMethod, loading: liveLoading }
            : {
                name: t.snapshot?.name ?? '',
                url: t.snapshot?.url ?? '',
                method: t.snapshot?.method ?? ('GET' as HttpMethod),
                loading: t.snapshot?.loading ?? false
              }
          const label = tabLabel(view)

          return (
            <div
              key={t.id}
              role="tab"
              onClick={() => select(t.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  close(t.id)
                }
              }}
              className={`group flex min-w-28 max-w-48 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 text-xs transition-colors ${
                active
                  ? 'border-blue-500 bg-zinc-800/50 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:bg-zinc-800/30 hover:text-zinc-300'
              }`}
            >
              <span className={`shrink-0 text-[10px] font-bold ${METHOD_COLORS[view.method]}`}>
                {SHORT[view.method]}
              </span>
              <span className="min-w-0 flex-1 truncate" title={label}>
                {label}
              </span>
              {view.loading && (
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-400" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  close(t.id)
                }}
                className={`shrink-0 rounded px-1 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 ${
                  active ? '' : 'invisible group-hover:visible'
                }`}
                title="Cerrar pestaña"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <button
        onClick={newTab}
        className="mx-1 shrink-0 self-center rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        title="Nueva pestaña (Cmd + T)"
      >
        ＋
      </button>
    </div>
  )
}