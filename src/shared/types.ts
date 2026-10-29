export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface SendRequestInput {
  method: HttpMethod
  url: string
  headers: { key: string; value: string }[]
  body?: string
  timeoutMs?: number
}

export type SendRequestResult =
  | {
      ok: true
      status: number
      statusText: string
      headers: Record<string, string>
      body: string
      timeMs: number
      sizeBytes: number
    }
  | {
      ok: false
      error: string
      timeMs: number
    }

// ---------- Colecciones ----------

export interface KeyValueData {
  key: string
  value: string
  enabled: boolean
}

/** Lo que se guarda en cada archivo .json */
export interface SavedRequest {
  name: string
  method: HttpMethod
  url: string
  headers: KeyValueData[]
  body: string
  description?: string
  /** Schemas de respuesta de la spec, por status. Solo existe en peticiones importadas de OpenAPI */
  responseSchemas?: ResponseSchemas
  /** Autenticación de la petición. Si no existe, la petición no usa auth */
  auth?: AuthConfig
  /** Aserciones propias que se evalúan junto al schema. Si no existe, no hay reglas */
  assertions?: Assertion[]
}

// ---------- Autenticación ----------

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey'

/** Todos los campos viven juntos para no perder lo escrito al cambiar de tipo */
export interface AuthConfig {
  type: AuthType
  /** Bearer */
  token: string
  /** Basic */
  username: string
  password: string
  /** API Key */
  keyName: string
  keyValue: string
  keyIn: 'header' | 'query'
}

// ---------- Aserciones ----------

/** Qué parte de la respuesta se revisa */
export type AssertionKind = 'status' | 'time' | 'header' | 'body'

export type AssertionOp =
  | 'eq'
  | 'neq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'contains'
  | 'notContains'
  | 'matches'
  | 'exists'
  | 'notExists'

export interface Assertion {
  id: string
  enabled: boolean
  kind: AssertionKind
  /** Nombre del header, o ruta dentro del JSON (data.items[0].id). Vacío en status y time */
  target: string
  op: AssertionOp
  /** Valor esperado como texto. Se ignora en exists / notExists */
  expected: string
}

export interface AssertionResult {
  id: string
  /** Descripción legible de la regla, ej: Status es igual a 200 */
  label: string
  passed: boolean
  /** Valor real encontrado, ya como texto corto */
  actual?: string
  /** Explicación cuando falla (vacío si pasó) */
  message: string
}

export interface RequestItem {
  /** Ruta relativa al workspace, con "/" (ej: "petstore/pet/post-pet.json") */
  path: string
  name: string
  method: HttpMethod
}

export interface FolderItem {
  name: string
  requests: RequestItem[]
}

export interface CollectionItem {
  id: string
  name: string
  baseUrl?: string
  requests: RequestItem[]
  folders: FolderItem[]
}

export interface SaveRequestInput {
  /** Si viene, sobrescribe ese archivo */
  relPath?: string
  /** Si no hay relPath, se crea un archivo nuevo en esta colección */
  collectionId?: string
  folder?: string
  request: SavedRequest
}

export type ImportResult =
  { ok: true; collectionId: string; name: string; count: number } | { ok: false; error: string }

/** Contrato de window.api (lo implementa preload, lo usa el renderer) */
export interface SondaApi {
  sendRequest: (input: SendRequestInput) => Promise<SendRequestResult>
  listCollections: () => Promise<CollectionItem[]>
  createCollection: (name: string) => Promise<CollectionItem>
  deleteCollection: (id: string) => Promise<void>
  readRequest: (path: string) => Promise<SavedRequest>
  saveRequest: (input: SaveRequestInput) => Promise<string>
  deleteRequest: (path: string) => Promise<void>
  openWorkspace: () => Promise<void>
  importSwagger: (url: string) => Promise<ImportResult>
  loadEnvironments: () => Promise<EnvironmentsData>
  saveEnvironments: (data: EnvironmentsData) => Promise<void>
}

// ---------- Entornos ----------

export interface EnvVariable {
  id: string
  key: string
  value: string
  /** Si es true, el valor se cifra en el keychain y no se escribe en environments.json */
  secret: boolean
  enabled: boolean
}

export interface Environment {
  id: string
  name: string
  variables: EnvVariable[]
}

export interface EnvironmentsData {
  activeId: string | null
  environments: Environment[]
}

// ---------- Validación de respuestas ----------

/** Schema JSON ya sin $ref (lo genera el importador de OpenAPI) */
export type JsonSchema = Record<string, unknown>

/**
 * Schemas de respuesta por código de status ("200", "4XX", "default").
 * null = el status está documentado pero sin body JSON (ej: 204).
 */
export type ResponseSchemas = Record<string, JsonSchema | null>

export interface SchemaIssue {
  /** Ruta al campo con problema: $.user.tags[0].name */
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface SchemaValidation {
  verdict: 'valid' | 'invalid' | 'undocumented' | 'no-schema' | 'skipped'
  /** Código de la spec que se usó: "200", "2XX" o "default" */
  matched?: string
  message?: string
  issues: SchemaIssue[]
  /** true si hubo más problemas de los que se muestran */
  truncated: boolean
}
