import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const KEY = 'sonda.theme'
const listeners = new Set<() => void>()

export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* sin almacenamiento: se usa el tema del sistema */
  }
  // Primer arranque: sigue el tema del sistema operativo
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
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
