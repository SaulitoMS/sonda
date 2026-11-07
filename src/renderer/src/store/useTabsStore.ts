import { create } from 'zustand'
import { isDirtyState } from '../../../shared/dirty'
import { nextActiveAfterClose, togglePinned } from '../../../shared/tabs'
import type { SavedRequest } from '../../../shared/types'
import { pushRecent } from '../lib/quickAccess'
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
  /** Anclada: va a la izquierda y no se cierra con "Cerrar las demás" */
  pinned?: boolean
}

interface TabsState {
  tabs: Tab[]
  activeId: string
  /** Pestañas cerradas, la más reciente primero (para reabrirlas) */
  closed: RequestSnapshot[]

  select: (id: string) => void
  newTab: () => void
  close: (id: string) => void
  /** Reabre la última pestaña cerrada */
  reopenClosed: () => void
  /** Crea una copia de la pestaña, sin vincular a ningún archivo, justo a su derecha */
  duplicate: (id: string) => void
  /** Cierra todas las pestañas menos la indicada (quedan en "reabrir cerrada") */
  closeOthers: (id: string) => void
  /** Ancla o desancla una pestaña */
  togglePin: (id: string) => void
  /** Abre una petición de una colección: salta a su pestaña si ya está abierta */
  openSaved: (saved: SavedRequest, path: string) => void
  /** Actualiza una pestaña inactiva (ej: llegó la respuesta de una petición en vuelo) */
  patchSnapshot: (id: string, patch: Partial<RequestSnapshot>) => void
  /** Marca como "sin guardar" las pestañas cuyo archivo ya no existe */
  detachMatching: (matches: (file: string) => boolean) => void
  /** Cambia la ruta de las pestañas cuyo archivo se movió. `map` devuelve la ruta nueva, o null si no cambia */
  remapFiles: (map: (file: string) => string | null) => void
  /** Vuelve a leer del disco las pestañas de esos archivos, salvo las que tienen cambios sin guardar */
  refreshFiles: (paths: string[]) => Promise<void>
}

const MAX_CLOSED = 10

const makeTab = (): Tab => ({ id: crypto.randomUUID(), snapshot: null })

/** Guarda el estado en vivo dentro de la pestaña activa */
const freeze = (tabs: Tab[], activeId: string): Tab[] =>
  tabs.map((t) => (t.id === activeId ? { ...t, snapshot: captureSnapshot() } : t))

export const useTabsStore = create<TabsState>((set, get) => {
  const first = makeTab()

  return {
    tabs: [first],
    activeId: first.id,
    closed: [],

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
      const { tabs, activeId, closed } = get()
      const next = nextActiveAfterClose(
        tabs.map((t) => t.id),
        id,
        activeId
      )

      // Se recuerda la pestaña para poder reabrirla; las que están en blanco no
      const snap = id === activeId ? captureSnapshot() : tabs.find((t) => t.id === id)?.snapshot
      const remembered =
        snap && (snap.currentFile || snap.url.trim())
          ? [{ ...snap, loading: false }, ...closed].slice(0, MAX_CLOSED)
          : closed

      // Era la última: queda una pestaña en blanco
      if (next === null) {
        const tab = makeTab()
        useRequestStore.setState(blankSnapshot())
        set({ tabs: [tab], activeId: tab.id, closed: remembered })
        return
      }

      const remaining = tabs.filter((t) => t.id !== id)

      // Se cerró una inactiva
      if (next === activeId) {
        set({ tabs: remaining, closed: remembered })
        return
      }

      // Se cerró la activa: se carga la vecina
      const target = remaining.find((t) => t.id === next)
      useRequestStore.setState(target?.snapshot ?? blankSnapshot())
      set({ tabs: remaining, activeId: next, closed: remembered })
    },

    reopenClosed: () => {
      const { tabs, activeId, closed } = get()
      const [snapshot, ...rest] = closed
      if (!snapshot) return

      const live = useRequestStore.getState()
      const liveIsBlank = !live.currentFile && !live.url.trim() && !live.body.trim()

      // Si la pestaña activa está en blanco, se reutiliza
      if (liveIsBlank) {
        useRequestStore.setState(snapshot)
        set({ closed: rest })
        return
      }

      const frozen = freeze(tabs, activeId)
      const tab = makeTab()
      useRequestStore.setState(snapshot)
      set({ tabs: [...frozen, tab], activeId: tab.id, closed: rest })
    },

    duplicate: (id) => {
      const { tabs, activeId } = get()
      const frozen = freeze(tabs, activeId)
      const index = frozen.findIndex((t) => t.id === id)
      const source = frozen[index]?.snapshot
      if (!source) return

      const name = source.name.trim()
      const copy: RequestSnapshot = {
        ...source,
        loading: false,
        currentFile: null,
        name: name ? `${name} (copia)` : ''
      }
      const tab: Tab = { id: crypto.randomUUID(), snapshot: copy }

      useRequestStore.setState(copy)
      set({
        tabs: [...frozen.slice(0, index + 1), tab, ...frozen.slice(index + 1)],
        activeId: tab.id
      })
    },

    closeOthers: (id) => {
      const { tabs, activeId, closed } = get()
      const frozen = freeze(tabs, activeId)
      const target = frozen.find((t) => t.id === id)
      if (!target) return

      // Las ancladas se quedan
      const kept = frozen.filter((t) => t.id === id || t.pinned)
      const discarded = frozen
        .filter((t) => !kept.includes(t))
        .flatMap((t) => (t.snapshot ? [t.snapshot] : []))
        .filter((s) => s.currentFile || s.url.trim())
        .map((s) => ({ ...s, loading: false }))

      // Si la activa se cierra, queda activa la elegida
      const nextActive = kept.some((t) => t.id === activeId) ? activeId : id
      if (nextActive !== activeId) useRequestStore.setState(target.snapshot ?? blankSnapshot())
      set({
        tabs: kept,
        activeId: nextActive,
        closed: [...discarded, ...closed].slice(0, MAX_CLOSED)
      })
    },

    togglePin: (id) => {
      const { tabs, activeId } = get()
      set({ tabs: togglePinned(freeze(tabs, activeId), id) })
    },

    openSaved: (saved, path) => {
      pushRecent(path)
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

    remapFiles: (map) => {
      // La pestaña activa vive en useRequestStore; la ruta no entra en la firma de "sin guardar"
      const live = useRequestStore.getState()
      const liveNext = live.currentFile ? map(live.currentFile) : null
      if (liveNext) useRequestStore.setState({ currentFile: liveNext })

      set((state) => ({
        tabs: state.tabs.map((t) => {
          const file = t.snapshot?.currentFile
          const next = file ? map(file) : null
          return next && t.snapshot ? { ...t, snapshot: { ...t.snapshot, currentFile: next } } : t
        })
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
