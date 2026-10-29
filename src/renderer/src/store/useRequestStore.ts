import { create } from 'zustand'
import type { HttpMethod, SendRequestResult } from '../../../shared/types'

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

  setMethod: (m: HttpMethod) => void
  setUrl: (u: string) => void
  setHeaders: (h: KeyValue[]) => void
  setBody: (b: string) => void
  send: () => Promise<void>
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

    // Si hay body JSON y no se definió Content-Type, lo agregamos
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
  }
}))