import { BINARY_FIELD } from './bodyForm'
import type { ExportFile } from './postmanExport'
import type { AuthConfig, FormFieldData, KeyValueData, SavedRequest } from './types'

type Json = Record<string, unknown>

/** Sonda usa {{variable}}; Insomnia escribe {{ _.variable }}. Las dinámicas ({{$uuid}}) no tienen equivalente directo */
const toInsomniaVars = (text: string): string =>
  text.replace(/\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}/g, '{{ _.$1 }}')

function exportAuth(auth: AuthConfig | undefined): Json | undefined {
  if (!auth || auth.type === 'inherit') return undefined
  switch (auth.type) {
    case 'none':
      return { type: 'none' }
    case 'bearer':
      return { type: 'bearer', token: toInsomniaVars(auth.token), prefix: '' }
    case 'basic':
      return {
        type: 'basic',
        username: toInsomniaVars(auth.username),
        password: toInsomniaVars(auth.password),
        useISO88591: false
      }
    case 'digest':
      return {
        type: 'digest',
        username: toInsomniaVars(auth.username),
        password: toInsomniaVars(auth.password)
      }
    case 'apikey':
      return {
        type: 'apikey',
        key: toInsomniaVars(auth.keyName),
        value: toInsomniaVars(auth.keyValue),
        addTo: auth.keyIn === 'query' ? 'queryParams' : 'header'
      }
    case 'oauth2':
      return {
        type: 'oauth2',
        grantType: 'client_credentials',
        accessTokenUrl: toInsomniaVars(auth.oauthTokenUrl ?? ''),
        clientId: toInsomniaVars(auth.oauthClientId ?? ''),
        clientSecret: toInsomniaVars(auth.oauthClientSecret ?? ''),
        scope: toInsomniaVars(auth.oauthScope ?? '')
      }
    case 'oauth1':
      return {
        type: 'oauth1',
        consumerKey: toInsomniaVars(auth.username),
        consumerSecret: toInsomniaVars(auth.password),
        tokenKey: toInsomniaVars(auth.token),
        tokenSecret: toInsomniaVars(auth.oauth1TokenSecret ?? ''),
        signatureMethod: auth.oauth1Method ?? 'HMAC-SHA1',
        realm: toInsomniaVars(auth.oauth1Realm ?? '')
      }
    case 'awsv4':
      return {
        type: 'iam',
        accessKeyId: toInsomniaVars(auth.username),
        secretAccessKey: toInsomniaVars(auth.password),
        sessionToken: toInsomniaVars(auth.token),
        region: auth.awsRegion ?? '',
        service: auth.awsService ?? ''
      }
  }
}

const exportHeaders = (headers: KeyValueData[]): Json[] =>
  headers
    .filter((h) => h.key.trim())
    .map((h) => ({
      name: h.key.trim(),
      value: toInsomniaVars(h.value),
      ...(h.enabled ? {} : { disabled: true })
    }))

function exportParams(fields: FormFieldData[], withFiles: boolean): Json[] {
  return fields
    .filter((f) => f.key.trim())
    .map((f) => {
      const base = { name: f.key.trim(), ...(f.enabled ? {} : { disabled: true }) }
      return withFiles && f.type === 'file'
        ? { ...base, type: 'file', value: '', fileName: f.value }
        : { ...base, value: toInsomniaVars(f.value) }
    })
}

/** Content-Type sin parámetros (charset…) de la petición, si lo define */
const contentTypeOf = (headers: KeyValueData[]): string => {
  const h = headers.find((x) => x.enabled && x.key.trim().toLowerCase() === 'content-type')
  return h ? h.value.split(';')[0].trim().toLowerCase() : ''
}

const isJson = (text: string): boolean => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function exportBody(req: SavedRequest): Json | undefined {
  const form = req.bodyForm
  if (form && form.mode !== 'raw') {
    if (form.mode === 'binary') {
      const file = form.fields.find((f) => f.key.trim() === BINARY_FIELD && f.value.trim())
      return file ? { mimeType: 'application/octet-stream', fileName: file.value } : undefined
    }
    return form.mode === 'urlencoded'
      ? {
          mimeType: 'application/x-www-form-urlencoded',
          params: exportParams(form.fields, false)
        }
      : { mimeType: 'multipart/form-data', params: exportParams(form.fields, true) }
  }
  if (!req.body.trim()) return undefined
  const declared = contentTypeOf(req.headers)
  const mimeType = declared || (isJson(req.body) ? 'application/json' : 'text/plain')
  return { mimeType, text: toInsomniaVars(req.body) }
}

function exportRequest(req: SavedRequest, id: string, parentId: string, sortKey: number): Json {
  const auth = exportAuth(req.auth)
  const body = exportBody(req)
  return {
    _id: id,
    _type: 'request',
    parentId,
    name: req.name,
    method: req.method,
    url: toInsomniaVars(req.url),
    parameters: [],
    headers: exportHeaders(req.headers),
    body: body ?? {},
    ...(auth ? { authentication: auth } : {}),
    ...(req.description ? { description: req.description } : {}),
    metaSortKey: sortKey
  }
}

/**
 * Convierte las peticiones de una colección de Sonda en un export de Insomnia v4 (JSON).
 * Las carpetas van primero y después las peticiones sueltas. La baseUrl pasa al entorno base.
 * Schemas, aserciones, extracciones y scripts no existen en Insomnia, así que no se exportan.
 */
export function buildInsomniaExport(
  name: string,
  baseUrl: string | undefined,
  files: ExportFile[],
  now: Date = new Date()
): Json {
  const workspaceId = 'wrk_sonda'
  const folders = new Map<string, ExportFile[]>()
  const root: ExportFile[] = []

  for (const file of files) {
    const slash = file.path.indexOf('/')
    if (slash === -1) {
      root.push(file)
      continue
    }
    const folder = file.path.slice(0, slash)
    folders.set(folder, [...(folders.get(folder) ?? []), file])
  }

  const byName = (a: ExportFile, b: ExportFile): number =>
    a.request.name.localeCompare(b.request.name)

  const resources: Json[] = [
    { _id: workspaceId, _type: 'workspace', parentId: null, name, scope: 'collection' }
  ]
  if (baseUrl) {
    resources.push({
      _id: 'env_sonda_base',
      _type: 'environment',
      parentId: workspaceId,
      name: 'Base Environment',
      data: { baseUrl },
      isPrivate: false,
      metaSortKey: 1
    })
  }

  let order = 0
  let requestCount = 0
  const nextKey = (): number => (order += 1000)
  const addRequest = (file: ExportFile, parentId: string): void => {
    requestCount += 1
    resources.push(exportRequest(file.request, `req_sonda_${requestCount}`, parentId, nextKey()))
  }

  let folderCount = 0
  for (const [folder, items] of [...folders.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    folderCount += 1
    const folderId = `fld_sonda_${folderCount}`
    resources.push({
      _id: folderId,
      _type: 'request_group',
      parentId: workspaceId,
      name: folder,
      metaSortKey: nextKey()
    })
    for (const file of [...items].sort(byName)) addRequest(file, folderId)
  }
  for (const file of [...root].sort(byName)) addRequest(file, workspaceId)

  return {
    _type: 'export',
    __export_format: 4,
    __export_date: now.toISOString(),
    __export_source: 'sonda',
    resources
  }
}
