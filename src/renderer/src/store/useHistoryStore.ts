import { create } from 'zustand'
import {
  parseStored,
  pushEntry,
  truncateResponse,
  type HistoryEntry
} from '../../../shared/history'
import type { AuthConfig, HttpMethod, SendRequestResult } from '../../../shared/types'

const KEY = 'sonda.history.v1'

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Si el almacenamiento se llena, recorta a la mitad y reintenta */
function persist(list: HistoryEntry[]): void {
  let current = list
  while (current.length > 0) {
    try {
      localStorage.setItem(KEY, JSON.stringify(current))
      return
    } catch {
      current = current.slice(0, Math.floor(current.length / 2))
    }
  }
  try {
    localStorage.removeItem(KEY)
  } catch {
    // sin almacenamiento disponible: el historial vive solo en memoria
  }
}

export interface HistoryInput {
  method: HttpMethod
  url: string
  headers: { key: string; value: string; enabled: boolean }[]
  body: string
  auth: AuthConfig
  response: SendRequestResult
}

interface HistoryState {
  entries: HistoryEntry[]
  add: (input: HistoryInput) => void
  remove: (id: string) => void
  clear: () => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: parseStored(readRaw()),

  add: (input) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      at: Date.now(),
      method: input.method,
      url: input.url.trim(),
      headers: input.headers
        .filter((h) => h.key.trim())
        .map(({ key, value, enabled }) => ({ key, value, enabled })),
      body: input.body,
      ...(input.auth.type !== 'none' ? { auth: input.auth } : {}),
      response: truncateResponse(input.response)
    }
    const entries = pushEntry(get().entries, entry)
    persist(entries)
    set({ entries })
  },

  remove: (id) => {
    const entries = get().entries.filter((e) => e.id !== id)
    persist(entries)
    set({ entries })
  },

  clear: () => {
    persist([])
    set({ entries: [] })
  }
}))