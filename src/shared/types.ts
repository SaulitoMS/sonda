export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface SendRequestInput {
  method: HttpMethod
  url: string
  headers: { key: string; value: string }[]
  body?: string
  timeoutMs?: number
  /** Acepta certificados autofirmados (útil en https://localhost) */
  insecure?: boolean
  /** Si es false, no sigue redirecciones y devuelve el 3xx tal cual */
  followRedirects?: boolean
  formData?: FormPart[]
  bodyForm?: BodyFormData
  /** Identificador para poder cancelar esta petición con cancelRequest */
  requestId?: string
}

/** Respuesta que no es texto (imagen, PDF, zip…) */
export interface BinaryBody {
  /** Content-Type sin parámetros, ej: image/png */
  contentType: string
  /** Contenido en base64. Vacío si superó el límite o si se descartó (historial) */
  base64: string
  /** true si el archivo superó el límite y no se incluyó */
  truncated: boolean
}

export type SendRequestResult =
  | {
      ok: true
      status: number
      statusText: string
      headers: Record<string, string>
      /** Texto de la respuesta. Vacío si es binaria (ver `binary`) */
      body: string
      /** Solo existe si la respuesta no es texto */
      binary?: BinaryBody
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
  /** Body de formulario (urlencoded / form-data). Si no existe, el body es el texto de `body` */
  bodyForm?: BodyFormData
  description?: string
  /** Schemas de respuesta de la spec, por status. Solo existe en peticiones importadas de OpenAPI */
  responseSchemas?: ResponseSchemas

  /** Schema del body que espera la spec (solo JSON). Solo existe en peticiones importadas de OpenAPI */
  requestSchema?: JsonSchema
  /** Autenticación de la petición. Si no existe, la petición no usa auth */
  auth?: AuthConfig
  /** Aserciones propias que se evalúan junto al schema. Si no existe, no hay reglas */
  assertions?: Assertion[]
  /** Valores de la respuesta que se guardan en variables del entorno. Si no existe, no se extrae nada */
  extractions?: Extraction[]
}

// ---------- Autenticación ----------

export type AuthType = 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2'

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
  /** OAuth 2.0 (client credentials). Opcionales: solo existen si el usuario eligió este tipo */
  oauthTokenUrl?: string
  oauthClientId?: string
  oauthClientSecret?: string
  oauthScope?: string
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

// ---------- Extracción de valores ----------

/** De dónde se toma el valor */
export type ExtractionSource = 'body' | 'header'

export interface Extraction {
  id: string
  enabled: boolean
  source: ExtractionSource
  /** Ruta dentro del JSON (data.token) o nombre del header. En body, vacío = body completo */
  path: string
  /** Variable de entorno donde se guarda, sin llaves (ej: token) */
  variable: string
  /** Si la variable aún no existe en el entorno, se crea como secreta (cifrada en el keychain) */
  secret: boolean
}

export interface ExtractionResult {
  id: string
  variable: string
  ok: boolean
  /** Valor extraído, como texto (solo si ok) */
  value?: string
  secret: boolean
  /** Por qué falló (vacío si salió bien) */
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
  /** URL de la spec de donde se importó (solo colecciones importadas) */
  source?: string
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
  | { ok: true; collectionId: string; name: string; count: number; warnings?: string[] }
  | { ok: false; error: string }

export type ExportResult = { ok: true; path: string; count: number } | { ok: false; error: string }

export interface CookieInfo {
  id: string
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  /** Marca de tiempo en ms. null = cookie de sesión */
  expiresAt: number | null
}

/** Contrato de window.api (lo implementa preload, lo usa el renderer) */
export interface SondaApi {
  sendRequest: (input: SendRequestInput) => Promise<SendRequestResult>
  cancelRequest: (requestId: string) => Promise<void>
  listCollections: () => Promise<CollectionItem[]>
  createCollection: (name: string) => Promise<CollectionItem>
  deleteCollection: (id: string) => Promise<void>
  readRequest: (path: string) => Promise<SavedRequest>
  saveRequest: (input: SaveRequestInput) => Promise<string>
  deleteRequest: (path: string) => Promise<void>
  openWorkspace: () => Promise<void>
  importSwagger: (url: string) => Promise<ImportResult>
  /** Abre el selector de archivos e importa una colección de Postman. null = el usuario canceló */
  importPostman: () => Promise<ImportResult | null>
  /** Exporta una colección a un archivo de Postman v2.1. null = el usuario canceló */
  exportPostman: (collectionId: string) => Promise<ExportResult | null>
  loadEnvironments: () => Promise<EnvironmentsData>
  saveEnvironments: (data: EnvironmentsData) => Promise<void>
  previewSync: (collectionId: string) => Promise<SyncPreviewResult>
  applySync: (collectionId: string, options: SyncOptions) => Promise<SyncResult>
  pickFile: () => Promise<string | null>
  listCookies: () => Promise<CookieInfo[]>
  deleteCookie: (id: string) => Promise<void>
  clearCookies: () => Promise<void>
  loadSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<AppSettings>
}

export type SslMode = 'auto' | 'verify' | 'ignore'

export interface AppSettings {
  /** Tiempo máximo de espera por petición */
  timeoutSeconds: number
  followRedirects: boolean
  /** auto: tolera certificados inválidos solo en localhost · verify: siempre verifica · ignore: nunca verifica */
  sslMode: SslMode
  /** Proxy http(s) para todas las peticiones salvo las de localhost. Vacío = sin proxy */
  proxyUrl: string
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

// ---------- Re-sincronizar una spec ----------

/** Qué parte de una petición cambió en la spec */
export type SyncChangeKind = 'url' | 'body' | 'requestSchema' | 'responseSchemas'

export interface SyncEndpointInfo {
  key: string
  method: HttpMethod
  name: string
  folder: string
}

export interface SyncChangeInfo {
  /** Ruta relativa al workspace, la misma que usan las pestañas */
  path: string
  key: string
  method: HttpMethod
  name: string
  kinds: SyncChangeKind[]
  /** Lo que el usuario también editó: su versión se conserva */
  keptUserEdits: SyncChangeKind[]
}

export interface SyncRemovedInfo {
  path: string
  key: string
  method: HttpMethod
  name: string
}

export interface SyncOptions {
  add: boolean
  update: boolean
  remove: boolean
}

export type SyncPreviewResult =
  | {
      ok: true
      source: string
      specName: string
      added: SyncEndpointInfo[]
      changed: SyncChangeInfo[]
      removed: SyncRemovedInfo[]
      unchanged: number
      baseUrlChange?: { from: string; to: string }
    }
  | { ok: false; error: string }

export type SyncResult =
  | {
      ok: true
      added: number
      updated: number
      removed: number
      updatedPaths: string[]
      removedPaths: string[]
      baseUrlChange?: { from: string; to: string }
    }
  | { ok: false; error: string }

// ---------- Body de formulario ----------

export type BodyMode = 'raw' | 'urlencoded' | 'form-data'

export interface FormFieldData {
  key: string
  /** Texto del campo, o ruta absoluta del archivo si type es 'file' */
  value: string
  type: 'text' | 'file'
  enabled: boolean
}

export interface FormField extends FormFieldData {
  id: string
}

/** Lo que se guarda en disco (sin ids) */
export interface BodyFormData {
  mode: BodyMode
  fields: FormFieldData[]
}

/** Lo que vive en el store (con ids para la tabla) */
export interface BodyForm {
  mode: BodyMode
  fields: FormField[]
}

/** Campo ya resuelto, listo para que el proceso principal arme el multipart */
export interface FormPart {
  key: string
  kind: 'text' | 'file'
  value: string
}
