import { create } from 'zustand'
import { isDirtyState } from '../../../shared/dirty'
import { nextActiveAfterClose } from '../../../shared/tabs'
import type { SavedRequest } from '../../../shared/types'
import {
  blankSnapshot,
  captureSnapshot,
  snapshotFromSaved,
  useRequestStore,
  type RequestSnapshot
} from './useRequestStore'

export interface Tab {
  id: string
  /** Estado guardado de la pestaña. En la activa puede estar desactualizado: manda useRequestStore */
  snapshot: RequestSnapshot | null
}

interface TabsState {
  tabs: Tab[]
  activeId: string

  select: (id: string) => void
  newTab: () => void
  close: (id: string) => void
  /** Abre una petición de una colección: salta a su pestaña si ya está abierta */
  openSaved: (saved: SavedRequest, path: string) => void
  /** Actualiza una pestaña inactiva (ej: llegó la respuesta de una petición en vuelo) */
  patchSnapshot: (id: string, patch: Partial<RequestSnapshot>) => void
  /** Marca como "sin guardar" las pestañas cuyo archivo ya no existe */
  detachMatching: (matches: (file: string) => boolean) => void
  /** Vuelve a leer del disco las pestañas de esos archivos, salvo las que tienen cambios sin guardar */
  refreshFiles: (paths: string[]) => Promise<void>
}

const makeTab = (): Tab => ({ id: crypto.randomUUID(), snapshot: null })

/** Guarda el estado en vivo dentro de la pestaña activa */
const freeze = (tabs: Tab[], activeId: string): Tab[] =>
  tabs.map((t) => (t.id === activeId ? { ...t, snapshot: captureSnapshot() } : t))

export const useTabsStore = create<TabsState>((set, get) => {
  const first = makeTab()

  return {
    tabs: [first],
    activeId: first.id,

    select: (id) => {
      const { tabs, activeId } = get()
      if (id === activeId) return
      const frozen = freeze(tabs, activeId)
      const target = frozen.find((t) => t.id === id)
      if (!target) return
      useRequestStore.setState(target.snapshot ?? blankSnapshot())
      set({ tabs: frozen, activeId: id })
    },

    newTab: () => {
      const { tabs, activeId } = get()
      const tab = makeTab()
      useRequestStore.setState(blankSnapshot())
      set({ tabs: [...freeze(tabs, activeId), tab], activeId: tab.id })
    },

    close: (id) => {
      const { tabs, activeId } = get()
      const next = nextActiveAfterClose(
        tabs.map((t) => t.id),
        id,
        activeId
      )

      // Era la última: queda una pestaña en blanco
      if (next === null) {
        const tab = makeTab()
        useRequestStore.setState(blankSnapshot())
        set({ tabs: [tab], activeId: tab.id })
        return
      }

      const remaining = tabs.filter((t) => t.id !== id)

      // Se cerró una inactiva
      if (next === activeId) {
        set({ tabs: remaining })
        return
      }

      // Se cerró la activa: se carga la vecina
      const target = remaining.find((t) => t.id === next)
      useRequestStore.setState(target?.snapshot ?? blankSnapshot())
      set({ tabs: remaining, activeId: next })
    },

    openSaved: (saved, path) => {
      const { tabs, activeId } = get()
      const live = useRequestStore.getState()

      if (live.currentFile === path) return

      const existing = tabs.find((t) => t.id !== activeId && t.snapshot?.currentFile === path)
      if (existing) {
        get().select(existing.id)
        return
      }

      // Si la pestaña activa está en blanco, se reutiliza
      if (!live.currentFile && !live.url.trim() && !live.body.trim()) {
        live.loadSaved(saved, path)
        return
      }

      get().newTab()
      useRequestStore.getState().loadSaved(saved, path)
    },

    patchSnapshot: (id, patch) =>
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === id && t.snapshot ? { ...t, snapshot: { ...t.snapshot, ...patch } } : t
        )
      })),

    detachMatching: (matches) => {
      const live = useRequestStore.getState()
      if (live.currentFile && matches(live.currentFile)) live.detach()

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.snapshot?.currentFile && matches(t.snapshot.currentFile)
            ? { ...t, snapshot: { ...t.snapshot, currentFile: null } }
            : t
        )
      }))
    },

    refreshFiles: async (paths) => {
      const wanted = new Set(paths)

      // Primero se lee todo del disco (async); después se aplica de una vez
      const fresh = new Map<string, SavedRequest>()
      const open = new Set([
        useRequestStore.getState().currentFile,
        ...get().tabs.map((t) => t.snapshot?.currentFile ?? null)
      ])
      for (const file of open) {
        if (!file || !wanted.has(file)) continue
        try {
          fresh.set(file, await window.api.readRequest(file))
        } catch {
          // el archivo ya no existe: no hay nada que recargar
        }
      }

      const live = useRequestStore.getState()
      const liveFresh = live.currentFile ? fresh.get(live.currentFile) : undefined
      if (live.currentFile && liveFresh && !isDirtyState(live)) {
        live.loadSaved(liveFresh, live.currentFile)
      }

      set((state) => ({
        tabs: state.tabs.map((t) => {
          if (t.id === state.activeId || !t.snapshot?.currentFile) return t
          const saved = fresh.get(t.snapshot.currentFile)
          if (!saved || isDirtyState(t.snapshot)) return t
          return {
            ...t,
            snapshot: { ...t.snapshot, ...snapshotFromSaved(saved, t.snapshot.currentFile) }
          }
        })
      }))
    }
  }
})
