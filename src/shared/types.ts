import type {
  SavedWebSocket,
  SavedWebSocketItem,
  SaveWebSocketResult,
  WsConnectInput,
  WsConnectResult,
  WsEvent
} from './websocket'
import type { MockChaos } from './mockChaos'
import type { MockOverride } from './mockOverrides'

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
  /** Ruta de un archivo que se envía tal cual como body (modo binary) */
  bodyFile?: string
  bodyForm?: BodyFormData
  /** Identificador para poder cancelar esta petición con cancelRequest */
  requestId?: string
  /**
   * Petición hecha desde la pestaña: si la respuesta es un stream (SSE) no vence por tiempo
   * y sus eventos se envían en vivo. Sin esto, un stream se corta al llegar al tiempo límite.
   */
  live?: boolean
}

/** Un salto de redirección que se siguió antes de llegar a la respuesta final */
export interface RedirectHop {
  /** 301, 302, 303, 307 o 308 */
  status: number
  /** Dónde se pidió */
  url: string
  /** A dónde mandó el servidor (ya resuelta si era relativa) */
  location: string
  timeMs: number
  /** Cuántas cookies intentó guardar esa respuesta */
  setCookies: number
}

/** Cómo terminó de leerse un stream de eventos */
export type StreamEnd = 'closed' | 'cancelled' | 'timeout' | 'limit' | 'error'

export interface StreamInfo {
  endedBy: StreamEnd
  /** Detalle cuando endedBy es "error" */
  error?: string
}

/** Trozo de un stream que el proceso principal manda mientras sigue abierto */
export interface StreamChunk {
  requestId: string
  chunk: string
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

/** Cuánto tardó abrir la conexión. Solo existe en peticiones directas (no por proxy) */
export interface ConnectionTiming {
  dnsMs: number
  /** TCP, más el handshake TLS si es https (sin el DNS) */
  connectMs: number
  secure: boolean
  /** true = se reutilizó una conexión abierta, por eso no hubo DNS ni conexión */
  reused: boolean
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
      /** Tiempo hasta recibir los headers (primer byte), incluye DNS, conexión y TLS */
      ttfbMs?: number
      sizeBytes: number
      /** Solo existe si la respuesta es un text/event-stream */
      stream?: StreamInfo
      /** Saltos seguidos hasta llegar aquí. Solo existe si hubo redirecciones */
      redirects?: RedirectHop[]
      /** URL de la respuesta final. Solo existe si hubo redirecciones */
      finalUrl?: string
      /** Tiempos de la conexión. Solo existe si la petición no pasó por un proxy */
      connection?: ConnectionTiming
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

/** Ajustes propios de una petición. Lo que no esté definido usa los ajustes globales */
export interface RequestOverrides {
  /** Tiempo límite en segundos (1 a 600) */
  timeoutSeconds?: number
  followRedirects?: boolean
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
  /** Script que corre antes de enviar. Si no existe, no hay script */
  preScript?: string
  /** Script que corre al recibir la respuesta. Si no existe, no hay script */
  postScript?: string
  /** Tiempo límite y redirecciones propios de la petición. Si no existe, usa los ajustes globales */
  overrides?: RequestOverrides
}

// ---------- Autenticación ----------

export type AuthType =
  'inherit' | 'none' | 'bearer' | 'basic' | 'digest' | 'apikey' | 'oauth2' | 'awsv4'

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
  /** OAuth 2.0. Opcionales: solo existen si el usuario eligió este tipo */
  /** OAuth 2.0. Opcionales: solo existen si el usuario eligió este tipo */
  oauthGrant?: 'client_credentials' | 'password' | 'authorization_code'
  oauthTokenUrl?: string
  /** Solo para "authorization_code" */
  oauthAuthUrl?: string
  /** Solo para "authorization_code". Vacío o 0 = puerto automático */
  oauthRedirectPort?: string
  oauthClientId?: string
  oauthClientSecret?: string
  oauthScope?: string
  /** Solo para el grant "password" */
  oauthUsername?: string
  oauthPassword?: string
  /** AWS Signature V4. Usa username = Access Key, password = Secret Key y token = Session Token (opcional) */
  awsRegion?: string
  awsService?: string
}

// ---------- Aserciones ----------

/** Qué parte de la respuesta se revisa */
export type AssertionKind = 'status' | 'time' | 'size' | 'header' | 'body'

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
  | 'isType'
  | 'lenEq'
  | 'lenGt'
  | 'lenLt'

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

/** Scripts que corren en todas las peticiones de una colección o carpeta, antes del script de la petición */
export interface ScopeScripts {
  /** Antes de enviar */
  pre?: string
  /** Al recibir la respuesta */
  post?: string
}

export interface FolderItem {
  name: string
  requests: RequestItem[]
  /** Auth de la carpeta. Si no existe (o es "inherit"), sus peticiones heredan la de la colección */
  auth?: AuthConfig
  /** Headers de la carpeta. Se suman a los de la colección; los de la petición tienen prioridad */
  headers?: KeyValueData[]
  /** Scripts de la carpeta. Corren después de los de la colección y antes de los de la petición */
  scripts?: ScopeScripts
}

export interface CollectionItem {
  id: string
  name: string
  baseUrl?: string
  /** URL de la spec de donde se importó (solo colecciones importadas) */
  source?: string
  requests: RequestItem[]
  folders: FolderItem[]
  /** Auth de la colección. Si no existe, las peticiones que heredan no usan auth */
  auth?: AuthConfig
  /** Headers que heredan todas las peticiones de la colección */
  headers?: KeyValueData[]
  /** Variables de la colección. Valen solo si el entorno activo no define la misma clave */
  variables?: KeyValueData[]
  /** Scripts que corren en todas las peticiones de la colección */
  scripts?: ScopeScripts
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

export type ExportResult =
  { ok: true; path: string; count: number; warnings?: string[] } | { ok: false; error: string }

export interface CookieInfo {
  id: string
  name: string
  value: string
  domain: string
  /** true = solo aplica al host exacto; false = también a sus subdominios */
  hostOnly: boolean
  path: string
  secure: boolean
  /** Marca de tiempo en ms. null = cookie de sesión */
  expiresAt: number | null
}

/** Cookie escrita a mano en el modal de cookies */
export interface CookieInput {
  name: string
  value: string
  /** Con punto inicial (.ejemplo.com) aplica también a los subdominios */
  domain: string
  path: string
  secure: boolean
  /** Marca de tiempo en ms. null = cookie de sesión */
  expiresAt: number | null
  /** Id de la cookie que se está editando: se reemplaza aunque cambie su nombre, dominio o ruta */
  replaceId?: string
}

export interface OAuthAuthorizeInput {
  authUrl: string
  clientId: string
  scope: string
  /** 0 = que el sistema elija un puerto libre */
  port: number
}

export type OAuthAuthorizeResult =
  { ok: true; code: string; verifier: string; redirectUri: string } | { ok: false; error: string }

// ---------- Papelera ----------

export type TrashKind = 'request' | 'collection'

export interface TrashItem {
  id: string
  kind: TrashKind
  name: string
  /** Ruta que tenía dentro del workspace: "petstore/pet/get-pet.json" o "petstore" */
  originalPath: string
  deletedAt: number
}

/** Contrato de window.api (lo implementa preload, lo usa el renderer) */
export interface SondaApi {
  sendRequest: (input: SendRequestInput) => Promise<SendRequestResult>
  cancelRequest: (requestId: string) => Promise<void>
  /** Escucha los trozos de un stream en curso. Devuelve la función para dejar de escuchar */
  onStream: (listener: (msg: StreamChunk) => void) => () => void
  listCollections: () => Promise<CollectionItem[]>
  createCollection: (name: string) => Promise<CollectionItem>
  deleteCollection: (id: string) => Promise<void>
  readRequest: (path: string) => Promise<SavedRequest>
  saveRequest: (input: SaveRequestInput) => Promise<string>
  deleteRequest: (path: string) => Promise<void>
  /** Mueve una petición a una colección (folder = null) o a una de sus carpetas. Devuelve la ruta nueva */
  moveRequest: (path: string, collectionId: string, folder: string | null) => Promise<string>
  /** Mueve una carpeta a otra colección. Devuelve el nombre final de la carpeta (puede cambiar si ya existía) */
  moveFolder: (collectionId: string, folder: string, targetCollectionId: string) => Promise<string>
  /** Guarda el orden de las colecciones (lista de ids) */
  reorderCollections: (ids: string[]) => Promise<void>
  /**
   * Guarda el orden de las carpetas y peticiones de una colección (folder = null) o de una carpeta.
   * `names` son nombres de carpeta y de archivo (.json), en el orden que debe verse
   */
  reorderItems: (collectionId: string, folder: string | null, names: string[]) => Promise<void>
  /** Guarda la auth de una colección (folder = null) o de una de sus carpetas. null = quitarla */
  setScopeAuth: (
    collectionId: string,
    folder: string | null,
    auth: AuthConfig | null
  ) => Promise<void>
  /** Guarda los headers heredables de una colección (folder = null) o de una carpeta. null = quitarlos */
  setScopeHeaders: (
    collectionId: string,
    folder: string | null,
    headers: KeyValueData[] | null
  ) => Promise<void>
  /** Guarda los scripts heredables de una colección (folder = null) o de una carpeta. null = quitarlos */
  setScopeScripts: (
    collectionId: string,
    folder: string | null,
    scripts: ScopeScripts | null
  ) => Promise<void>
  /** Guarda las variables de una colección. null = quitarlas */
  setCollectionVariables: (collectionId: string, variables: KeyValueData[] | null) => Promise<void>
  openWorkspace: () => Promise<void>
  importSwagger: (url: string) => Promise<ImportResult>
  /** Abre el selector de archivos e importa una colección de Postman. null = el usuario canceló */
  importPostman: () => Promise<ImportResult | null>
  /** Exporta una colección a un archivo de Postman v2.1. null = el usuario canceló */
  exportPostman: (collectionId: string) => Promise<ExportResult | null>
  /** Exporta la documentación de una colección en Markdown. null = el usuario canceló */
  exportDocs: (collectionId: string) => Promise<ExportResult | null>
  /** Exporta una colección como spec OpenAPI 3.0 (JSON). null = el usuario canceló */
  exportOpenApi: (collectionId: string) => Promise<ExportResult | null>
  loadEnvironments: () => Promise<EnvironmentsData>
  saveEnvironments: (data: EnvironmentsData) => Promise<void>
  previewSync: (collectionId: string) => Promise<SyncPreviewResult>
  applySync: (collectionId: string, options: SyncOptions) => Promise<SyncResult>
  pickFile: () => Promise<string | null>
  /** Abre el selector de carpetas. null = el usuario canceló */
  pickFolder: () => Promise<string | null>
  listCookies: () => Promise<CookieInfo[]>
  deleteCookie: (id: string) => Promise<void>
  clearCookies: () => Promise<void>
  /** Crea o reemplaza una cookie. Devuelve el error de validación, o null si salió bien */
  setCookie: (input: CookieInput) => Promise<string | null>
  loadSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<AppSettings>
  /** Levanta un servidor local que responde con datos de ejemplo según los schemas de la colección */
  startMock: (collectionId: string, port: number, chaos?: MockChaos) => Promise<MockStartResult>
  stopMock: () => Promise<void>
  getMockStatus: () => Promise<MockStatus>
  /** Últimas peticiones recibidas por el mock (máximo 200, solo en memoria) */
  getMockLog: () => Promise<MockLogEntry[]>
  clearMockLog: () => Promise<void>
  /** Respuesta actual de una ruta del mock en marcha ("GET /pet/{petId}"): la fijada a mano o la generada */
  getMockRoute: (key: string) => Promise<MockRouteDetail | null>
  /** Fija (o quita, con null) la respuesta de una ruta del mock en marcha. Se aplica al instante */
  setMockOverride: (key: string, override: MockOverride | null) => Promise<MockOverrideResult>
  /** Ejecuta un script de usuario en un contexto aislado (máximo 2 s) */
  runScript: (input: ScriptInput) => Promise<ScriptOutput>
  oauthAuthorize: (input: OAuthAuthorizeInput) => Promise<OAuthAuthorizeResult>
  /** Envía un POST JSON a un webhook. Devuelve el error, o null si salió bien */
  sendWebhook: (url: string, payload: unknown) => Promise<string | null>
  /** Abre una conexión WebSocket (solo una a la vez). Lo que llega se recibe con onWsEvent */
  wsConnect: (input: WsConnectInput) => Promise<WsConnectResult>
  /** Envía un mensaje: texto, o bytes si `binary` es true (entonces `data` es hexadecimal). Devuelve el error, o null si salió bien */
  wsSend: (id: string, data: string, binary?: boolean) => Promise<string | null>
  wsClose: (id: string) => Promise<void>
  /** Escucha los eventos de la conexión. Devuelve la función para dejar de escuchar */
  onWsEvent: (listener: (event: WsEvent) => void) => () => void
  /** Conexiones WebSocket guardadas en las colecciones (archivos *.ws.json) */
  listSavedWebSockets: () => Promise<SavedWebSocketItem[]>
  readSavedWebSocket: (path: string) => Promise<SavedWebSocket>
  /** Guarda una conexión en una colección. Con `path` sobrescribe esa; sin él crea un archivo nuevo */
  saveWebSocket: (
    collectionId: string,
    data: SavedWebSocket,
    path?: string
  ) => Promise<SaveWebSocketResult>
  deleteSavedWebSocket: (path: string) => Promise<void>
  listTrash: () => Promise<TrashItem[]>
  /** Devuelve la ruta donde quedó lo restaurado (puede cambiar si ya existía otra igual) */
  restoreFromTrash: (id: string) => Promise<string>
  emptyTrash: () => Promise<void>
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
  /** Reintentos automáticos ante errores de red / 429 / 502 / 503 / 504. 0 = desactivado */
  retries: number
  /** Espera base entre reintentos en ms (se duplica en cada intento) */
  retryDelayMs: number
  /** Ruta al certificado de cliente (PEM). Vacío = sin mTLS */
  clientCertPath: string
  /** Ruta a la llave privada del certificado de cliente (PEM, sin contraseña) */
  clientKeyPath: string
  /** Si se indica, el certificado solo se envía a ese host (ej: api.banco.com). Vacío = a todos los https */
  clientCertHost: string
  /** Certificado de una CA propia (PEM) en la que confiar además de las públicas. Vacío = solo las públicas */
  caCertPath: string
  /** Carpeta donde viven las colecciones y los entornos. Vacío = Documentos/Sonda */
  workspacePath: string
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
  /** Pide confirmación antes de enviar peticiones que modifican datos (POST/PUT/PATCH/DELETE) */
  protected?: boolean
  /** Color de identificación (ver envColor.ts). Si no existe, el entorno no tiene color */
  color?: string
}

export interface EnvironmentsData {
  activeId: string | null
  environments: Environment[]
  /** Variables que valen en todos los entornos (tienen la prioridad más baja) */
  globals?: EnvVariable[]
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

export type ChangeImpact = 'breaking' | 'compatible'
export type ChangeArea = 'endpoint' | 'url' | 'request' | 'response'

/** Un cambio concreto de la spec, clasificado por si rompe a un cliente existente */
export interface ApiChange {
  impact: ChangeImpact
  area: ChangeArea
  message: string
}

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
  /** Detalle de qué cambió y si rompe o no */
  changes: ApiChange[]
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

export type BodyMode = 'raw' | 'urlencoded' | 'form-data' | 'binary'

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

// ---------- Servidor mock ----------

export interface MockRouteInfo {
  method: HttpMethod
  /** Ruta con parámetros, ej: /pet/{petId} */
  path: string
  /** Status con el que responde (el primer 2xx documentado, o el que fijó el usuario) */
  status: number
  /** true si el usuario fijó la respuesta a mano */
  overridden?: boolean
}

/** Respuesta actual de una ruta del mock, lista para editarse */
export interface MockRouteDetail {
  status: number
  body: string
  /** true si es la que fijó el usuario; false si es la generada desde la spec */
  overridden: boolean
}

export type MockOverrideResult =
  { ok: true; routes: MockRouteInfo[] } | { ok: false; error: string }

export type MockStatus =
  | { running: false }
  | {
      running: true
      collectionId: string
      port: number
      routes: MockRouteInfo[]
      chaos?: MockChaos
    }

/** Una petición que recibió el servidor mock */
export interface MockLogEntry {
  id: number
  /** ISO 8601 */
  at: string
  method: string
  /** Path y query tal como llegaron */
  url: string
  status: number
  /** false = ninguna ruta de la colección coincidió (404 del mock) */
  matched: boolean
  timeMs: number
  headers: Record<string, string>
  /** Primeros 4000 caracteres del body */
  body: string
}

export type MockStartResult =
  { ok: true; port: number; routes: MockRouteInfo[] } | { ok: false; error: string }

// ---------- Scripts ----------

/** Lo que se le entrega a un script antes (pre) o después (post) de enviar una petición */
export interface ScriptInput {
  phase: 'pre' | 'post'
  code: string
  /** Variables visibles para el script (entorno + colección + datos), ya resueltas */
  vars: Record<string, string>
  /** Solo en el pre-script: la petición que está por enviarse, sin resolver {{variables}} */
  request?: ScriptRequest
  /** Solo en el post-script: la respuesta recibida */
  response?: ScriptResponse
}

export interface ScriptRequest {
  method: string
  url: string
  headers: Record<string, string>
  body: string
}

export interface ScriptResponse {
  status: number
  statusText: string
  timeMs: number
  headers: Record<string, string>
  body: string
}

export interface ScriptTest {
  name: string
  passed: boolean
  message: string
}

export interface ScriptOutput {
  /** false si el script no compiló, lanzó un error o tardó demasiado */
  ok: boolean
  error: string
  logs: string[]
  tests: ScriptTest[]
  /** Variables que el script asignó con sonda.env.set */
  envSet: Record<string, string>
  /** Solo en el pre-script: la petición tal como la dejó el script */
  request?: ScriptRequest
}
