import { create } from 'zustand'
import { parseStoredSnapshots, type Snapshot } from '../../../shared/snapshot'

const KEY = 'sonda.snapshots.v1'

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function persist(all: Record<string, Snapshot>): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
    return true
  } catch {
    return false
  }
}

interface SnapshotState {
  snapshots: Record<string, Snapshot>
  /** Devuelve false si el almacenamiento local está lleno */
  save: (snapshot: Snapshot) => boolean
  remove: (key: string) => void
  setIgnore: (key: string, ignore: string[]) => void
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: parseStoredSnapshots(readRaw()),

  save: (snapshot) => {
    const next = { ...get().snapshots, [snapshot.key]: snapshot }
    if (!persist(next)) return false
    set({ snapshots: next })
    return true
  },

  remove: (key) => {
    const next = { ...get().snapshots }
    delete next[key]
    persist(next)
    set({ snapshots: next })
  },

  setIgnore: (key, ignore) => {
    const current = get().snapshots[key]
    if (!current) return
    const next = { ...get().snapshots, [key]: { ...current, ignore } }
    persist(next)
    set({ snapshots: next })
  }
}))