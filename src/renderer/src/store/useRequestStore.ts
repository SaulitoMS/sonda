import { create } from 'zustand'
import { emptyAuth } from '../../../shared/auth'
import type {
  Assertion,
  AssertionResult,
  AuthConfig,
  HttpMethod,
  JsonSchema,
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
  auth: AuthConfig
  /** Reglas propias de la petición (status, tiempo, headers, body) */
  assertions: Assertion[]
  loading: boolean
  response: SendRequestResult | null

  /** Schema del body que espera la spec (solo si viene de una spec OpenAPI) */
  requestSchema: JsonSchema | null
  /** Schemas de respuesta de la petición cargada (solo si viene de una spec OpenAPI) */
  responseSchemas: ResponseSchemas | null
  /** Resultado de validar la última respuesta contra esos schemas */
  validation: SchemaValidation | null
  /** Resultado de las aserciones en la última respuesta */
  assertionResults: AssertionResult[]

  /** Avisos de la última petición enviada (ej: auth vacía) */
  warnings: string[]

  /** Archivo de la colección que se está editando (null = petición sin guardar) */
  currentFile: string | null
  name: string

  setMethod: (m: HttpMethod) => void
  setUrl: (u: string) => void
  setHeaders: (h: KeyValue[]) => void
  setBody: (b: string) => void
  setAuth: (a: AuthConfig) => void
  setAssertions: (a: Assertion[]) => void
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
  auth: emptyAuth(),
  assertions: [],
  loading: false,
  response: null,
  requestSchema: null,
  responseSchemas: null,
  validation: null,
  assertionResults: [],
  warnings: [],
  currentFile: null,
  name: '',

  setMethod: (method) => set({ method }),
  setUrl: (url) => set({ url }),
  setHeaders: (headers) => set({ headers }),
  setBody: (body) => set({ body }),
  setAuth: (auth) => set({ auth }),
  setAssertions: (assertions) => set({ assertions }),

  send: async () => {
    const {
      method,
      url,
      headers,
      body,
      auth,
      assertions,
      loading,
      requestSchema,
      responseSchemas
    } = get()
    if (loading || !url.trim()) return

    set({ loading: true })
    const { response, validation, assertionResults, warnings } = await executeRequest(
      { method, url, headers, body, auth, assertions, requestSchema, responseSchemas },
      useEnvironmentStore.getState().getActive()
    )
    set({ response, validation, assertionResults, warnings, loading: false })
  },

  loadSaved: (saved, path) =>
    set({
      method: saved.method,
      url: saved.url,
      headers: [...(saved.headers ?? []).map((h) => ({ id: crypto.randomUUID(), ...h })), newRow()],
      body: saved.body ?? '',
      auth: { ...emptyAuth(), ...saved.auth },
      assertions: saved.assertions ?? [],
      currentFile: path,
      name: saved.name,
      response: null,
      requestSchema: saved.requestSchema ?? null,
      responseSchemas: saved.responseSchemas ?? null,
      validation: null,
      assertionResults: [],
      warnings: []
    }),

  toSaved: (name) => {
    const { method, url, headers, body, auth, assertions, requestSchema, responseSchemas } = get()
    return {
      name,
      method,
      url: url.trim(),
      headers: headers
        .filter((h) => h.key.trim())
        .map(({ key, value, enabled }) => ({ key, value, enabled })),
      body,
      ...(auth.type !== 'none' ? { auth } : {}),
      ...(assertions.length > 0 ? { assertions } : {}),
      // Se conservan para no perderlos al volver a guardar una petición importada
      ...(requestSchema ? { requestSchema } : {}),
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
      auth: emptyAuth(),
      assertions: [],
      currentFile: null,
      name: '',
      response: null,
      requestSchema: null,
      responseSchemas: null,
      validation: null,
      assertionResults: [],
      warnings: []
    })
}))