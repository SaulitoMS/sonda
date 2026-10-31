import { useSyncExternalStore } from 'react'
import { DEFAULT_LAYOUT, normalizeLayout, type LayoutState } from '../../../shared/layout'

const KEY = 'sonda.layout'
const listeners = new Set<() => void>()

function load(): LayoutState {
  try {
    return normalizeLayout(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

let state: LayoutState = load()

export function getLayout(): LayoutState {
  return state
}

/** Cambia una parte de la disposición, la valida y la recuerda para la próxima vez */
export function setLayout(patch: Partial<LayoutState>): void {
  state = normalizeLayout({ ...state, ...patch })
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* sin almacenamiento: la disposición solo dura la sesión */
  }
  listeners.forEach((l) => l())
}

export function useLayout(): LayoutState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state
  )
}
