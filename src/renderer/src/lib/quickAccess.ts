import { useSyncExternalStore } from 'react'

const KEY = 'sonda.quickAccess'
const MAX_RECENT = 8
const listeners = new Set<() => void>()

export interface QuickAccessState {
  /** Rutas de peticiones fijadas */
  pinned: string[]
  /** Rutas de las últimas peticiones abiertas, la más reciente primero */
  recent: string[]
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

function load(): QuickAccessState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<QuickAccessState> | null
    return { pinned: strings(raw?.pinned), recent: strings(raw?.recent).slice(0, MAX_RECENT) }
  } catch {
    return { pinned: [], recent: [] }
  }
}

let state: QuickAccessState = load()

function commit(next: QuickAccessState): void {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* sin almacenamiento: solo dura la sesión */
  }
  listeners.forEach((l) => l())
}

export function getQuickAccess(): QuickAccessState {
  return state
}

export function togglePin(path: string): void {
  commit({
    ...state,
    pinned: state.pinned.includes(path)
      ? state.pinned.filter((p) => p !== path)
      : [...state.pinned, path]
  })
}

export function pushRecent(path: string): void {
  if (state.recent[0] === path) return
  commit({ ...state, recent: [path, ...state.recent.filter((p) => p !== path)].slice(0, MAX_RECENT) })
}

export function useQuickAccess(): QuickAccessState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state
  )
}