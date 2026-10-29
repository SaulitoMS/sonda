import { create } from 'zustand'
import type { HttpMethod, SavedRequest, SendRequestResult } from '../../../shared/types'

export interface KeyValue {
  id: string
  key: string
  value: string
  enabled: boolean
}

export const newRow = (): KeyValue => ({
  id: crypto.randomUUID(),
  key: '',
  value: '',
  enabled: true
})

interface RequestState {
  method: HttpMethod
  url: string
  headers: KeyValue[]
  body: string
  loading: boolean
  response: SendRequestResult | null

  /** Archivo de la colección que se está editando (null = petición sin guardar) */
  currentFile: string | null
  name: string

  setMethod: (m: HttpMethod) => void
  setUrl: (u: string) => void
  setHeaders: (h: KeyValue[]) => void
  setBody: (b: string) => void
  send: () => Promise<void>

  loadSaved: (saved: SavedRequest, path: string) => void
  toSaved: (name: string) => SavedRequest
  markSaved: (path: string, name: string) => void
  detach: () => void
  reset: () => void
}

const looksLikeJson = (text: string): boolean => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

export const useRequestStore = create<RequestState>((set, get) => ({
  method: 'GET',
  url: 'https://jsonplaceholder.typicode.com/todos/1',
  headers: [newRow()],
  body: '',
  loading: false,
  response: null,
  currentFile: null,
  name: '',

  setMethod: (method) => set({ method }),
  setUrl: (url) => set({ url }),
  setHeaders: (headers) => set({ headers }),
  setBody: (body) => set({ body }),

  send: async () => {
    const { method, url, headers, body, loading } = get()
    if (loading || !url.trim()) return

    set({ loading: true })

    const activeHeaders = headers
      .filter((h) => h.enabled && h.key.trim())
      .map(({ key, value }) => ({ key, value }))

    const hasContentType = activeHeaders.some((h) => h.key.toLowerCase() === 'content-type')
    if (body.trim() && !hasContentType && looksLikeJson(body)) {
      activeHeaders.push({ key: 'Content-Type', value: 'application/json' })
    }

    const response = await window.api.sendRequest({
      method,
      url: url.trim(),
      headers: activeHeaders,
      body: body.trim() ? body : undefined
    })

    set({ response, loading: false })
  },

  loadSaved: (saved, path) =>
    set({
      method: saved.method,
      url: saved.url,
      headers: [...(saved.headers ?? []).map((h) => ({ id: crypto.randomUUID(), ...h })), newRow()],
      body: saved.body ?? '',
      currentFile: path,
      name: saved.name,
      response: null
    }),

  toSaved: (name) => {
    const { method, url, headers, body } = get()
    return {
      name,
      method,
      url: url.trim(),
      headers: headers
        .filter((h) => h.key.trim())
        .map(({ key, value, enabled }) => ({ key, value, enabled })),
      body
    }
  },

  markSaved: (path, name) => set({ currentFile: path, name }),
  detach: () => set({ currentFile: null }),

  reset: () =>
    set({
      method: 'GET',
      url: '',
      headers: [newRow()],
      body: '',
      currentFile: null,
      name: '',
      response: null
    })
}))