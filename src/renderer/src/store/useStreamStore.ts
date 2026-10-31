import { create } from 'zustand'
import { tabForRequest } from '../lib/inFlight'

/** Cuánto texto se conserva para mostrar en vivo (la respuesta completa llega al terminar) */
const LIVE_MAX_CHARS = 200_000
const encoder = new TextEncoder()

export interface LiveStream {
  text: string
  /** Total recibido hasta ahora, aunque `text` solo conserve el final */
  bytes: number
}

interface StreamState {
  /** Stream en curso por pestaña */
  live: Record<string, LiveStream>
  append: (tabId: string, chunk: string) => void
  clear: (tabId: string) => void
}

export const useStreamStore = create<StreamState>((set) => ({
  live: {},

  append: (tabId, chunk) =>
    set((s) => {
      const prev = s.live[tabId] ?? { text: '', bytes: 0 }
      return {
        live: {
          ...s.live,
          [tabId]: {
            text: (prev.text + chunk).slice(-LIVE_MAX_CHARS),
            bytes: prev.bytes + encoder.encode(chunk).length
          }
        }
      }
    }),

  clear: (tabId) =>
    set((s) => {
      if (!(tabId in s.live)) return s
      const live = { ...s.live }
      delete live[tabId]
      return { live }
    })
}))

// Los trozos llegan del proceso principal con el id de la petición: se reparten a su pestaña
const unsubscribe = window.api.onStream(({ requestId, chunk }) => {
  const tabId = tabForRequest(requestId)
  if (tabId) useStreamStore.getState().append(tabId, chunk)
})
// En desarrollo (HMR) este módulo se vuelve a evaluar: evita escuchar dos veces
import.meta.hot?.dispose(unsubscribe)
