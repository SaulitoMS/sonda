import { create } from 'zustand'

const MAX_ENTRIES = 300

interface Base {
  id: number
  at: number
}

export interface ConsoleRequestEntry extends Base {
  kind: 'request'
  method: string
  url: string
  ok: boolean
  status?: number
  timeMs: number
  sizeBytes?: number
  retries: number
  error?: string
}

export interface ConsoleLogEntry extends Base {
  kind: 'log'
  phase: 'pre' | 'post'
  url: string
  text: string
}

export type ConsoleEntry = ConsoleRequestEntry | ConsoleLogEntry

type NewRequest = Omit<ConsoleRequestEntry, 'id' | 'at' | 'kind'>

interface ConsoleState {
  entries: ConsoleEntry[]
  addRequest: (entry: NewRequest) => void
  addLogs: (logs: string[], phase: 'pre' | 'post', url: string) => void
  clear: () => void
}

let nextId = 1

export const useConsoleStore = create<ConsoleState>((set) => ({
  entries: [],
  addRequest: (entry) =>
    set((s) => ({
      entries: [
        ...s.entries,
        { ...entry, kind: 'request' as const, id: nextId++, at: Date.now() }
      ].slice(-MAX_ENTRIES)
    })),
  addLogs: (logs, phase, url) => {
    if (logs.length === 0) return
    set((s) => ({
      entries: [
        ...s.entries,
        ...logs.map((text) => ({
          kind: 'log' as const,
          phase,
          url,
          text,
          id: nextId++,
          at: Date.now()
        }))
      ].slice(-MAX_ENTRIES)
    }))
  },
  clear: () => set({ entries: [] })
}))
