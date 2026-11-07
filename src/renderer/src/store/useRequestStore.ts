import { create } from 'zustand'
import { emptyAuth } from '../../../shared/auth'
import { fromBodyFormData, toBodyFormData } from '../../../shared/bodyForm'
import { requestSignature } from '../../../shared/dirty'
import type {
  Assertion,
  AssertionResult,
  AuthConfig,
  BodyForm,
  Extraction,
  ExtractionResult,
  HttpMethod,
  JsonSchema,
  RequestOverrides,
  ResponseSchemas,
  SavedRequest,
  SchemaValidation,
  SendRequestResult
} from '../../../shared/types'
import { persistExtractions } from '../lib/persistExtractions'
import { executeRequest } from '../lib/runRequest'
import { useEnvironmentStore } from './useEnvironmentStore'
import { useHistoryStore } from './useHistoryStore'
import { useStreamStore } from './useStreamStore'
import { useTabsStore } from './useTabsStore'
import { finishInFlight, startInFlight } from '../lib/inFlight'
import { resolveAuthForPath } from '../lib/inheritedAuth'
import { cleanOverrides, hasOverrides } from '../../../shared/requestOverrides'
import { confirmSendMessage } from '../../../shared/writeGuard'
import { envMismatch } from '../../../shared/envMismatch'
import {
  buildVarMap,
  withCollectionVariables,
  withGlobalVariables
} from '../../../shared/variables'
import { collectionVarsForPath } from '../lib/collectionVariables'
import { notifyIfSlow } from '../lib/notifySlow'

/** Pares entorno + host que ya se confirmaron en esta sesión (no se vuelve a preguntar) */
const confirmedMismatch = new Set<string>()

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

export interface RequestState {
  method: HttpMethod
  url: string
  headers: KeyValue[]
  body: string
  /** Body de formulario (urlencoded / form-data). Con mode "raw" se usa `body` */
  bodyForm: BodyForm
  auth: AuthConfig
  /** Reglas propias de la petición (status, tiempo, headers, body) */
  assertions: Assertion[]
  /** Valores de la respuesta que se guardan en variables del entorno */
  extractions: Extraction[]
  /** Script que corre antes de enviar (puede cambiar la petición y asignar variables) */
  preScript: string
  /** Script que corre al recibir la respuesta (tests y variables) */
  postScript: string
  /** Notas o documentación de la petición (en las importadas de OpenAPI, la descripción de la spec) */
  description: string
  /** Tiempo límite y redirecciones propios de la petición. Vacío = usa los ajustes globales */
  overrides: RequestOverrides
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
  /** Firma de lo último guardado o abierto: si difiere de la actual, hay cambios sin guardar */
  baseline: string

  setMethod: (m: HttpMethod) => void
  setUrl: (u: string) => void
  setHeaders: (h: KeyValue[]) => void
  setBody: (b: string) => void
  setBodyForm: (f: BodyForm) => void
  setAuth: (a: AuthConfig) => void
  setAssertions: (a: Assertion[]) => void
  setExtractions: (e: Extraction[]) => void
  setPreScript: (s: string) => void
  setPostScript: (s: string) => void
  setDescription: (d: string) => void
  setOverrides: (o: RequestOverrides) => void
  send: () => Promise<void>

  loadSaved: (saved: SavedRequest, path: string) => void
  toSaved: (name: string) => SavedRequest
  markSaved: (path: string, name: string) => void
  detach: () => void
  reset: () => void
}

/** Todo lo que define el estado de una pestaña (sin las funciones) */
export type RequestSnapshot = Pick<
  RequestState,
  | 'method'
  | 'url'
  | 'headers'
  | 'body'
  | 'bodyForm'
  | 'auth'
  | 'assertions'
  | 'extractions'
  | 'preScript'
  | 'postScript'
  | 'description'
  | 'overrides'
  | 'loading'
  | 'response'
  | 'requestSchema'
  | 'responseSchemas'
  | 'validation'
  | 'assertionResults'
  | 'extractionResults'
  | 'warnings'
  | 'currentFile'
  | 'name'
  | 'baseline'
>

/** Lo que cambia al abrir una petición guardada (no toca `loading`) */
export type LoadedState = Omit<RequestSnapshot, 'loading'>

export function blankSnapshot(): RequestSnapshot {
  const fields = {
    method: 'GET' as HttpMethod,
    url: '',
    headers: [newRow()],
    body: '',
    bodyForm: fromBodyFormData(),
    auth: emptyAuth(),
    assertions: [] as Assertion[],
    extractions: [] as Extraction[],
    preScript: '',
    postScript: '',
    description: '',
    overrides: {} as RequestOverrides,
    loading: false,
    response: null,
    requestSchema: null,
    responseSchemas: null,
    validation: null,
    assertionResults: [] as AssertionResult[],
    extractionResults: [] as ExtractionResult[],
    warnings: [] as string[],
    currentFile: null,
    name: ''
  }
  return { ...fields, baseline: requestSignature(fields) }
}

/** El estado que resulta de abrir una petición guardada, con su línea base ya calculada */
export function snapshotFromSaved(saved: SavedRequest, path: string): LoadedState {
  const fields = {
    method: saved.method,
    url: saved.url,
    headers: [...(saved.headers ?? []).map((h) => ({ id: crypto.randomUUID(), ...h })), newRow()],
    body: saved.body ?? '',
    bodyForm: fromBodyFormData(saved.bodyForm),
    auth: { ...emptyAuth(), ...saved.auth },
    assertions: saved.assertions ?? [],
    extractions: saved.extractions ?? [],
    preScript: saved.preScript ?? '',
    postScript: saved.postScript ?? '',
    description: saved.description ?? '',
    overrides: cleanOverrides(saved.overrides)
  }
  return {
    ...fields,
    baseline: requestSignature(fields),
    response: null,
    requestSchema: saved.requestSchema ?? null,
    responseSchemas: saved.responseSchemas ?? null,
    validation: null,
    assertionResults: [],
    extractionResults: [],
    warnings: [],
    currentFile: path,
    name: saved.name
  }
}

/** Foto del estado actual, para guardarla en la pestaña que se deja */
export function captureSnapshot(): RequestSnapshot {
  const s = useRequestStore.getState()
  return {
    method: s.method,
    url: s.url,
    headers: s.headers,
    body: s.body,
    bodyForm: s.bodyForm,
    auth: s.auth,
    assertions: s.assertions,
    extractions: s.extractions,
    preScript: s.preScript,
    postScript: s.postScript,
    description: s.description,
    overrides: s.overrides,
    loading: s.loading,
    response: s.response,
    requestSchema: s.requestSchema,
    responseSchemas: s.responseSchemas,
    validation: s.validation,
    assertionResults: s.assertionResults,
    extractionResults: s.extractionResults,
    warnings: s.warnings,
    currentFile: s.currentFile,
    name: s.name,
    baseline: s.baseline
  }
}

// La pestaña inicial arranca con una URL de ejemplo; eso no cuenta como "cambio"
const initialFields = {
  ...blankSnapshot(),
  url: 'https://jsonplaceholder.typicode.com/todos/1'
}
const initial: RequestSnapshot = { ...initialFields, baseline: requestSignature(initialFields) }

export const useRequestStore = create<RequestState>((set, get) => ({
  ...initial,

  setMethod: (method) => set({ method }),
  setUrl: (url) => set({ url }),
  setHeaders: (headers) => set({ headers }),
  setBody: (body) => set({ body }),
  setBodyForm: (bodyForm) => set({ bodyForm }),
  setAuth: (auth) => set({ auth }),
  setAssertions: (assertions) => set({ assertions }),
  setExtractions: (extractions) => set({ extractions }),
  setPreScript: (preScript) => set({ preScript }),
  setPostScript: (postScript) => set({ postScript }),
  setDescription: (description) => set({ description }),
  setOverrides: (overrides) => set({ overrides }),

  send: async () => {
    const {
      method,
      url,
      headers,
      body,
      bodyForm,
      auth,
      assertions,
      extractions,
      preScript,
      postScript,
      overrides,
      loading,
      requestSchema,
      responseSchemas,
      currentFile
    } = get()
    if (loading || !url.trim()) return

    const env = useEnvironmentStore.getState().getActive()

    // Entorno protegido: los métodos que modifican datos piden confirmación
    const guard = confirmSendMessage(env, method, url)
    if (guard && !confirm(guard)) return

    // Entorno y servidor que no parecen ir juntos (ej: "Producción" apuntando a localhost):
    // se pregunta una sola vez por sesión para cada par entorno + host
    const mismatch = envMismatch(
      env,
      url,
      buildVarMap(
        withGlobalVariables(
          withCollectionVariables(env, collectionVarsForPath(currentFile)),
          useEnvironmentStore.getState().data.globals
        )
      )
    )
    if (mismatch && !confirmedMismatch.has(mismatch.key)) {
      if (!confirm(mismatch.message)) return
      confirmedMismatch.add(mismatch.key)
    }

    // La pestaña desde la que se envía: el usuario puede cambiar de pestaña mientras responde
    const tabId = useTabsStore.getState().activeId
    const requestId = startInFlight(tabId)

    set({ loading: true })
    const {
      response,
      validation,
      assertionResults,
      extractions: extractionResults,
      warnings
    } = await executeRequest(
      {
        method,
        url,
        headers,
        body,
        bodyForm,
        auth,
        assertions,
        extractions,
        preScript,
        postScript,
        overrides,
        requestSchema,
        responseSchemas
      },
      useEnvironmentStore.getState().getActive(),
      { requestId, path: currentFile, live: true }
    )
    const wasCancelled = finishInFlight(tabId)
    // Ya llegó la respuesta completa: la vista en vivo sobra
    useStreamStore.getState().clear(tabId)

    // Los valores extraídos (y los que asignaron los scripts) pasan al entorno para que la siguiente petición ya los use
    const persistWarnings = await persistExtractions(extractionResults)

    const result = {
      response,
      validation,
      assertionResults,
      extractionResults,
      warnings: [...warnings, ...persistWarnings],
      loading: false
    }
    if (useTabsStore.getState().activeId === tabId) set(result)
    else useTabsStore.getState().patchSnapshot(tabId, result)

    // Lo que no llegó a enviarse (variables sin definir, URL inválida) o se canceló no entra al historial
    if (!wasCancelled && (response.ok || response.timeMs > 0)) {
      // Al historial va la auth que se aplicó, no el "inherit" (la colección puede cambiar después)
      const sent = resolveAuthForPath(auth, currentFile).auth ?? {
        ...emptyAuth(),
        type: 'none' as const
      }
      useHistoryStore.getState().add({ method, url, headers, body, bodyForm, auth: sent, response })
      notifyIfSlow(method, url, response)
    }
  },

  loadSaved: (saved, path) => set(snapshotFromSaved(saved, path)),

  toSaved: (name) => {
    const {
      method,
      url,
      headers,
      body,
      bodyForm,
      auth,
      assertions,
      extractions,
      preScript,
      postScript,
      description,
      overrides,
      requestSchema,
      responseSchemas
    } = get()
    const savedForm = toBodyFormData(bodyForm)
    return {
      name,
      method,
      url: url.trim(),
      headers: headers
        .filter((h) => h.key.trim())
        .map(({ key, value, enabled }) => ({ key, value, enabled })),
      body,
      ...(savedForm ? { bodyForm: savedForm } : {}),
      ...(auth.type !== 'inherit' ? { auth } : {}),
      ...(assertions.length > 0 ? { assertions } : {}),
      ...(extractions.length > 0 ? { extractions } : {}),
      ...(preScript.trim() ? { preScript } : {}),
      ...(postScript.trim() ? { postScript } : {}),
      ...(description.trim() ? { description } : {}),
      ...(hasOverrides(overrides) ? { overrides } : {}),
      // Se conservan para no perderlos al volver a guardar una petición importada
      ...(requestSchema ? { requestSchema } : {}),
      ...(responseSchemas ? { responseSchemas } : {})
    }
  },

  // Al guardar, lo actual pasa a ser la nueva línea base
  markSaved: (path, name) => set({ currentFile: path, name, baseline: requestSignature(get()) }),
  detach: () => set({ currentFile: null }),

  reset: () => set(blankSnapshot())
}))
