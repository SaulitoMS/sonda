import type { AuthConfig, FormFieldData, KeyValueData, SavedRequest } from './types'

export interface ExportFile {
  /** Ruta relativa a la colección, con "/" (ej: "pet/get-pet.json" o "get-pet.json") */
  path: string
  request: SavedRequest
}

type Json = Record<string, unknown>

const SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'

const entry = (key: string, value: string): Json => ({ key, value, type: 'string' })

function exportAuth(auth: AuthConfig | undefined): Json | undefined {
  if (!auth || auth.type === 'none') return undefined
  switch (auth.type) {
    case 'bearer':
      return { type: 'bearer', bearer: [entry('token', auth.token)] }
    case 'basic':
      return {
        type: 'basic',
        basic: [entry('username', auth.username), entry('password', auth.password)]
      }
    case 'apikey':
      return {
        type: 'apikey',
        apikey: [
          entry('key', auth.keyName),
          entry('value', auth.keyValue),
          entry('in', auth.keyIn)
        ]
      }
  }
}

const exportHeaders = (headers: KeyValueData[]): Json[] =>
  headers
    .filter((h) => h.key.trim())
    .map((h) => ({ key: h.key.trim(), value: h.value, ...(h.enabled ? {} : { disabled: true }) }))

function exportFields(fields: FormFieldData[], withTypes: boolean): Json[] {
  return fields
    .filter((f) => f.key.trim())
    .map((f) => {
      const base = { key: f.key.trim(), ...(f.enabled ? {} : { disabled: true }) }
      if (!withTypes) return { ...base, value: f.value }
      return f.type === 'file'
        ? { ...base, type: 'file', src: f.value }
        : { ...base, type: 'text', value: f.value }
    })
}

const looksLikeJson = (text: string): boolean => {
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
    return form.mode === 'urlencoded'
      ? { mode: 'urlencoded', urlencoded: exportFields(form.fields, false) }
      : { mode: 'formdata', formdata: exportFields(form.fields, true) }
  }
  if (!req.body.trim()) return undefined
  return {
    mode: 'raw',
    raw: req.body,
    ...(looksLikeJson(req.body) ? { options: { raw: { language: 'json' } } } : {})
  }
}

function exportRequest(req: SavedRequest): Json {
  const auth = exportAuth(req.auth)
  const body = exportBody(req)
  return {
    name: req.name,
    request: {
      method: req.method,
      header: exportHeaders(req.headers),
      url: { raw: req.url },
      ...(body ? { body } : {}),
      ...(auth ? { auth } : {}),
      ...(req.description ? { description: req.description } : {})
    },
    response: []
  }
}

/**
 * Convierte las peticiones de una colección de Sonda en una colección de Postman v2.1.
 * Las carpetas van primero y después las peticiones sueltas, como las muestra Postman.
 * Schemas, aserciones y extracciones no existen en Postman, así que no se exportan.
 */
export function buildPostmanCollection(
  name: string,
  baseUrl: string | undefined,
  files: ExportFile[]
): Json {
  const folders = new Map<string, Json[]>()
  const root: Json[] = []

  for (const file of files) {
    const slash = file.path.indexOf('/')
    const item = exportRequest(file.request)
    if (slash === -1) {
      root.push(item)
      continue
    }
    const folder = file.path.slice(0, slash)
    folders.set(folder, [...(folders.get(folder) ?? []), item])
  }

  const byName = (a: Json, b: Json): number => String(a.name).localeCompare(String(b.name))

  return {
    info: { name, schema: SCHEMA },
    item: [
      ...[...folders.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([folder, items]) => ({ name: folder, item: items.sort(byName) })),
      ...root.sort(byName)
    ],
    ...(baseUrl ? { variable: [{ key: 'baseUrl', value: baseUrl }] } : {})
  }
}