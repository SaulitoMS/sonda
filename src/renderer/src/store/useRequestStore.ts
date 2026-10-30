import { create } from 'zustand'
import { emptyAuth } from '../../../shared/auth'
import type {
  Assertion,
  AssertionResult,
  AuthConfig,
  Extraction,
  ExtractionResult,
  HttpMethod,
  JsonSchema,
  ResponseSchemas,
  SavedRequest,
  SchemaValidation,
  SendRequestResult
} from '../../../shared/types'
import { persistExtractions } from '../lib/persistExtractions'
import { executeRequest } from '../lib/runRequest'
import { useEnvironmentStore } from './useEnvironmentStore'
import { useHistoryStore } from './useHistoryStore'

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
  /** Valores de la respuesta que se guardan en variables del entorno */
  extractions: Extraction[]
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
  /** Qué se extrajo (o no) de la última respuesta */
  extractionResults: ExtractionResult[]

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
  setExtractions: (e: Extraction[]) => void
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
  extractions: [],
  loading: false,
  response: null,
  requestSchema: null,
  responseSchemas: null,
  validation: null,
  assertionResults: [],
  extractionResults: [],
  warnings: [],
  currentFile: null,
  name: '',

  setMethod: (method) => set({ method }),
  setUrl: (url) => set({ url }),
  setHeaders: (headers) => set({ headers }),
  setBody: (body) => set({ body }),
  setAuth: (auth) => set({ auth }),
  setAssertions: (assertions) => set({ assertions }),
  setExtractions: (extractions) => set({ extractions }),

  send: async () => {
    const {
      method,
      url,
      headers,
      body,
      auth,
      assertions,
      extractions,
      loading,
      requestSchema,
      responseSchemas
    } = get()
    if (loading || !url.trim()) return

    set({ loading: true })
    const {
      response,
      validation,
      assertionResults,
      extractions: extractionResults,
      warnings
    } = await executeRequest(
      { method, url, headers, body, auth, assertions, extractions, requestSchema, responseSchemas },
      useEnvironmentStore.getState().getActive()
    )
    // Los valores extraídos pasan al entorno para que la siguiente petición ya los use
    const persistWarnings = await persistExtractions(extractionResults)
    set({
      response,
      validation,
      assertionResults,
      extractionResults,
      warnings: [...warnings, ...persistWarnings],
      loading: false
    })

    // Lo que no llegó a enviarse (variables sin definir, URL inválida) no entra al historial
    if (response.ok || response.timeMs > 0) {
      useHistoryStore.getState().add({ method, url, headers, body, auth, response })
    }
  },

  loadSaved: (saved, path) =>
    set({
      method: saved.method,
      url: saved.url,
      headers: [...(saved.headers ?? []).map((h) => ({ id: crypto.randomUUID(), ...h })), newRow()],
      body: saved.body ?? '',
      auth: { ...emptyAuth(), ...saved.auth },
      assertions: saved.assertions ?? [],
      extractions: saved.extractions ?? [],
      currentFile: path,
      name: saved.name,
      response: null,
      requestSchema: saved.requestSchema ?? null,
      responseSchemas: saved.responseSchemas ?? null,
      validation: null,
      assertionResults: [],
      extractionResults: [],
      warnings: []
    }),

  toSaved: (name) => {
    const {
      method,
      url,
      headers,
      body,
      auth,
      assertions,
      extractions,
      requestSchema,
      responseSchemas
    } = get()
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
      ...(extractions.length > 0 ? { extractions } : {}),
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
      extractions: [],
      currentFile: null,
      name: '',
      response: null,
      requestSchema: null,
      responseSchemas: null,
      validation: null,
      assertionResults: [],
      extractionResults: [],
      warnings: []
    })
}))