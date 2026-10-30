import { create } from 'zustand'
import { nextActiveAfterClose } from '../../../shared/tabs'
import type { SavedRequest } from '../../../shared/types'
import {
  blankSnapshot,
  captureSnapshot,
  useRequestStore,
  type RequestSnapshot
} from './useRequestStore'

interface Tab {
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
    }
  }
})