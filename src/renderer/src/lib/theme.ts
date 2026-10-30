import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'sonda.theme'
const listeners = new Set<() => void>()

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

let current: Theme = getStoredTheme()

export function applyTheme(theme: Theme): void {
  current = theme
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* sin almacenamiento: el tema solo dura la sesión */
  }
  listeners.forEach((l) => l())
}

export function toggleTheme(): void {
  applyTheme(current === 'dark' ? 'light' : 'dark')
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current
  )
}