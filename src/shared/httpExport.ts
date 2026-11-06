import { BINARY_FIELD } from './bodyForm'
import type { ExportFile } from './postmanExport'
import type { SavedRequest } from './types'

const BOUNDARY = '----SondaBoundary'

const hasHeader = (req: SavedRequest, name: string): boolean =>
  req.headers.some((h) => h.enabled && h.key.trim().toLowerCase() === name)

/** Body de la petición en formato .http. Devuelve las líneas extra de headers y el texto del body */
function buildBody(req: SavedRequest): { headers: string[]; body: string } {
  const form = req.bodyForm
  if (!form) return { headers: [], body: req.body }

  const fields = form.fields.filter((f) => f.enabled && f.key.trim() !== '')
  if (form.mode === 'binary') {
    const file = fields.find((f) => f.key.trim() === BINARY_FIELD)
    return { headers: [], body: file ? `< ${file.value}` : '' }
  }
  if (form.mode === 'urlencoded') {
    const body = fields
      .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
      .join('&')
    return {
      headers: hasHeader(req, 'content-type')
        ? []
        : ['Content-Type: application/x-www-form-urlencoded'],
      body
    }
  }
  if (form.mode === 'form-data') {
    const parts = fields.map((f) =>
      f.type === 'file'
        ? `--${BOUNDARY}\nContent-Disposition: form-data; name="${f.key}"; filename="${f.value.split(/[\\/]/).pop()}"\n\n< ${f.value}`
        : `--${BOUNDARY}\nContent-Disposition: form-data; name="${f.key}"\n\n${f.value}`
    )
    return {
      headers: [`Content-Type: multipart/form-data; boundary=${BOUNDARY}`],
      body: parts.length > 0 ? `${parts.join('\n')}\n--${BOUNDARY}--` : ''
    }
  }
  return { headers: [], body: req.body }
}

/** Convierte una colección de Sonda en un archivo .http (VS Code REST Client / JetBrains) */
export function buildHttpFile(
  name: string,
  baseUrl: string | undefined,
  files: ExportFile[]
): string {
  const out: string[] = [`# ${name}`]
  if (baseUrl) out.push('', `@baseUrl = ${baseUrl}`)

  for (const { path, request: req } of files) {
    const lines: string[] = ['', `### ${req.name}`]
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    if (folder) lines.push(`# Carpeta: ${folder}`)
    for (const d of (req.description ?? '').split('\n')) if (d.trim()) lines.push(`# ${d.trim()}`)

    let url = req.url
    const headers = req.headers
      .filter((h) => h.enabled && h.key.trim() !== '')
      .map((h) => `${h.key.trim()}: ${h.value}`)

    const auth = req.auth
    if (auth && auth.type !== 'inherit' && auth.type !== 'none') {
      if (auth.type === 'bearer') headers.push(`Authorization: Bearer ${auth.token}`)
      else if (auth.type === 'basic')
        headers.push(`Authorization: Basic ${auth.username}:${auth.password}`)
      else if (auth.type === 'apikey' && auth.keyIn === 'header')
        headers.push(`${auth.keyName}: ${auth.keyValue}`)
      else if (auth.type === 'apikey')
        url += `${url.includes('?') ? '&' : '?'}${encodeURIComponent(auth.keyName)}=${auth.keyValue}`
      else lines.push(`# Auth "${auth.type}" no se puede exportar a .http: agrégala a mano`)
    }

    const { headers: extra, body } = buildBody(req)
    lines.push(`${req.method} ${url}`, ...headers, ...extra)
    if (body) lines.push('', body)
    out.push(...lines)
  }
  return out.join('\n') + '\n'
}
