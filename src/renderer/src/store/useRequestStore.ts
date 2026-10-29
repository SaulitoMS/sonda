import { create } from 'zustand'
import type {
  HttpMethod,
  ResponseSchemas,
  SavedRequest,
  SchemaValidation,
  SendRequestResult
} from '../../../shared/types'
import { executeRequest } from '../lib/runRequest'
import { useEnvironmentStore } from './useEnvironmentStore'

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

  /** Schemas de respuesta de la petición cargada (solo si viene de una spec OpenAPI) */
  responseSchemas: ResponseSchemas | null
  /** Resultado de validar la última respuesta contra esos schemas */
  validation: SchemaValidation | null

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

export const useRequestStore = create<RequestState>((set, get) => ({
  method: 'GET',
  url: 'https://jsonplaceholder.typicode.com/todos/1',
  headers: [newRow()],
  body: '',
  loading: false,
  response: null,
  responseSchemas: null,
  validation: null,
  currentFile: null,
  name: '',

  setMethod: (method) => set({ method }),
  setUrl: (url) => set({ url }),
  setHeaders: (headers) => set({ headers }),
  setBody: (body) => set({ body }),

  send: async () => {
    const { method, url, headers, body, loading, responseSchemas } = get()
    if (loading || !url.trim()) return

    set({ loading: true })
    const { response, validation } = await executeRequest(
      { method, url, headers, body, responseSchemas },
      useEnvironmentStore.getState().getActive()
    )
    set({ response, validation, loading: false })
  },

  loadSaved: (saved, path) =>
    set({
      method: saved.method,
      url: saved.url,
      headers: [...(saved.headers ?? []).map((h) => ({ id: crypto.randomUUID(), ...h })), newRow()],
      body: saved.body ?? '',
      currentFile: path,
      name: saved.name,
      response: null,
      responseSchemas: saved.responseSchemas ?? null,
      validation: null
    }),

  toSaved: (name) => {
    const { method, url, headers, body, responseSchemas } = get()
    return {
      name,
      method,
      url: url.trim(),
      headers: headers
        .filter((h) => h.key.trim())
        .map(({ key, value, enabled }) => ({ key, value, enabled })),
      body,
      // Se conservan para no perderlos al volver a guardar una petición importada
      ...(responseSchemas ? { responseSchemas } : {})
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
      response: null,
      responseSchemas: null,
      validation: null
    })
}))