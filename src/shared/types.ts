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
  | { ok: true; collectionId: string; name: string; count: number }
  | { ok: false; error: string }

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
}