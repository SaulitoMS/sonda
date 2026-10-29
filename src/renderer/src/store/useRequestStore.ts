import { create } from 'zustand'
import type {
  HttpMethod,
  ResponseSchemas,
  SavedRequest,
  SchemaValidation,
  SendRequestResult
} from '../../../shared/types'
import { validateResponse } from '../../../shared/validate'
import { buildVarMap, interpolate } from '../../../shared/variables'
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

    // 1. Resolver {{variables}} con el entorno activo
    const activeEnv = useEnvironmentStore.getState().getActive()
    const vars = buildVarMap(activeEnv)
    const missing = new Set<string>()

    const resolve = (text: string): string => {
      const result = interpolate(text, vars)
      result.missing.forEach((m) => missing.add(m))
      return result.text
    }

    const finalUrl = resolve(url.trim())
    const finalBody = body.trim() ? resolve(body) : undefined
    const activeHeaders = headers
      .filter((h) => h.enabled && h.key.trim())
      .map((h) => ({ key: resolve(h.key), value: resolve(h.value) }))

    // 2. Si falta alguna variable, no enviamos y lo explicamos
    if (missing.size > 0) {
      const names = [...missing].map((n) => `{{${n}}}`).join(', ')
      const hint = activeEnv
        ? `Defínelas en el entorno "${activeEnv.name}".`
        : 'Selecciona o crea un entorno en la cabecera.'
      set({
        response: { ok: false, error: `Variables sin definir: ${names}. ${hint}`, timeMs: 0 },
        validation: null
      })
      return
    }

    // 3. Content-Type automático para bodies JSON
    const hasContentType = activeHeaders.some((h) => h.key.toLowerCase() === 'content-type')
    if (finalBody && !hasContentType && looksLikeJson(finalBody)) {
      activeHeaders.push({ key: 'Content-Type', value: 'application/json' })
    }

    set({ loading: true })

    const response = await window.api.sendRequest({
      method,
      url: finalUrl,
      headers: activeHeaders,
      body: finalBody
    })

    // 4. Si la petición viene de una spec OpenAPI, validar la respuesta contra su schema
    const validation =
      response.ok && responseSchemas
        ? validateResponse({
            schemas: responseSchemas,
            status: response.status,
            method,
            headers: response.headers,
            body: response.body
          })
        : null

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
