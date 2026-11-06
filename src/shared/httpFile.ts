import { isDynamicVariable } from './dynamicVariables'
import type { ParsedPostman } from './postman'
import type { HttpMethod, KeyValueData, SavedRequest } from './types'

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const MAX_REQUESTS = 500
const SKIPPED_HEADERS = new Set(['content-length', 'host'])

/** ¿La ruta es un archivo .http / .rest (VS Code REST Client o JetBrains HTTP Client)? */
export const isHttpFilePath = (path: string): boolean => /\.(?:http|rest)$/i.test(path)

interface Notes {
  unsupportedVars: Set<string>
  unsupportedMeta: Set<string>
  skipped: string[]
  fileRefs: number
  responseRefs: boolean
}

/** {{$guid}} → {{$uuid}}. Lo que Sonda no genera (o trae argumentos) se deja tal cual y se avisa */
function convertDynamic(text: string, notes: Notes): string {
  return text.replace(/\{\{\s*(\$[A-Za-z]+)([^}]*)\}\}/g, (full, name: string, args: string) => {
    const mapped = name === '$guid' ? '$uuid' : name
    if (!isDynamicVariable(mapped) || args.trim()) {
      notes.unsupportedVars.add(name)
      return full
    }
    return `{{${mapped}}}`
  })
}

function pathOf(url: string): string {
  const noVars = url.replace(/^\{\{[^}]*\}\}/, '')
  const noHost = noVars.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '')
  const path = noHost.split(/[?#]/)[0]
  return path || '/'
}

function parseBlock(
  lines: string[],
  title: string,
  vars: Map<string, string>,
  notes: Notes
): SavedRequest | null {
  let i = 0
  let metaName = ''
  const comments: string[] = []

  // Preámbulo: comentarios, metadatos (# @name) y variables (@host = ...) hasta la línea de petición
  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const variable = /^@([A-Za-z_][\w.-]*)\s*=\s*(.*)$/.exec(line)
    if (variable) {
      vars.set(variable[1], convertDynamic(variable[2].trim(), notes))
      continue
    }
    if (/^(?:#|\/\/)/.test(line)) {
      const meta = /^(?:#|\/\/)\s*@([A-Za-z][\w-]*)\s*(.*)$/.exec(line)
      if (!meta) {
        comments.push(line.replace(/^(?:#|\/\/)\s?/, ''))
      } else if (meta[1] === 'name') {
        metaName = meta[2].trim()
      } else {
        notes.unsupportedMeta.add(meta[1])
      }
      continue
    }
    break
  }
  if (i >= lines.length) return null

  // Línea de petición: "POST https://x.io/a HTTP/1.1", o solo la URL (GET por defecto)
  const rest = lines[i].trim().replace(/\s+HTTP\/\d(?:\.\d)?$/i, '')
  i++
  let method = 'GET'
  let url = rest
  const mm = /^([A-Za-z]+)\s+(.+)$/.exec(rest)
  if (mm && (METHODS.has(mm[1].toUpperCase()) || /^[A-Z]+$/.test(mm[1]))) {
    method = mm[1].toUpperCase()
    url = mm[2].trim()
  }
  if (!METHODS.has(method)) {
    notes.skipped.push(`${method} ${pathOf(url)}`.slice(0, 60))
    return null
  }

  // Query en varias líneas: "?a=1" y "&b=2" justo debajo
  while (i < lines.length && /^\s*[?&]/.test(lines[i])) {
    url += lines[i].trim()
    i++
  }

  // Headers hasta la primera línea en blanco
  const headers: KeyValueData[] = []
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      break
    }
    if (/^\s*(?:#|\/\/)/.test(line)) continue
    const h = /^([^:\s][^:]*):\s*(.*)$/.exec(line)
    if (!h) break // no es un header: aquí empieza el body
    if (SKIPPED_HEADERS.has(h[1].trim().toLowerCase())) continue
    headers.push({ key: h[1].trim(), value: convertDynamic(h[2].trim(), notes), enabled: true })
  }

  // Body: el resto del bloque, sin líneas en blanco al inicio ni al final
  let body = lines.slice(i).join('\n').replace(/^\s*\n/, '').trimEnd()
  if (/^<(?:@\w*)?\s+\S+\s*$/.test(body)) {
    notes.fileRefs++
    body = ''
  }

  url = convertDynamic(url, notes)
  body = convertDynamic(body, notes)
  if (/\{\{\s*[\w-]+\.(?:response|request)\./.test(`${url}\n${body}\n${JSON.stringify(headers)}`)) {
    notes.responseRefs = true
  }

  const name = (title || metaName || `${method} ${pathOf(url)}`).slice(0, 80)
  return {
    name,
    method: method as HttpMethod,
    url,
    headers,
    body,
    ...(comments.length > 0 ? { description: comments.join('\n') } : {})
  }
}

/**
 * Convierte un archivo .http / .rest en una colección de Sonda.
 * Las peticiones se separan con líneas "###" (el texto después de ### es el nombre) y las
 * variables de archivo (@host = https://…) pasan al entorno que crea la importación.
 */
export function parseHttpFile(text: string, fileName: string): ParsedPostman {
  const notes: Notes = {
    unsupportedVars: new Set(),
    unsupportedMeta: new Set(),
    skipped: [],
    fileRefs: 0,
    responseRefs: false
  }
  const vars = new Map<string, string>()

  // Partir en bloques por las líneas "###"
  const blocks: { title: string; lines: string[] }[] = [{ title: '', lines: [] }]
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const sep = /^#{3,}\s*(.*)$/.exec(line.trim())
    if (sep) blocks.push({ title: sep[1].trim(), lines: [] })
    else blocks[blocks.length - 1].lines.push(line)
  }

  const requests: ParsedPostman['requests'] = []
  for (const block of blocks) {
    const request = parseBlock(block.lines, block.title, vars, notes)
    if (request) requests.push({ folder: '', request })
  }

  if (requests.length === 0) {
    throw new Error('El archivo no contiene peticiones HTTP (ej: "GET https://api.example.com/users")')
  }

  const warnings: string[] = []
  if (requests.length > MAX_REQUESTS) {
    warnings.push(`El archivo tiene ${requests.length} peticiones: se importaron las primeras ${MAX_REQUESTS}.`)
    requests.length = MAX_REQUESTS
  }
  if (notes.skipped.length > 0) {
    warnings.push(`Se omitieron peticiones con un método que Sonda no soporta: ${notes.skipped.join(', ')}.`)
  }
  if (notes.unsupportedVars.size > 0) {
    warnings.push(
      `Variables dinámicas sin equivalente en Sonda (se dejaron tal cual): ${[...notes.unsupportedVars].join(', ')}.`
    )
  }
  if (notes.responseRefs) {
    warnings.push(
      'Hay referencias a respuestas de otras peticiones ({{nombre.response.…}}). Sonda no las resuelve: usa la pestaña Extraer para guardar ese valor en una variable.'
    )
  }
  if (notes.fileRefs > 0) {
    warnings.push(`${notes.fileRefs} body(s) leían un archivo externo (< ./archivo): quedaron vacíos.`)
  }
  if (notes.unsupportedMeta.size > 0) {
    warnings.push(`Se ignoraron las anotaciones: ${[...notes.unsupportedMeta].map((m) => `@${m}`).join(', ')}.`)
  }

  const base = fileName.replace(/\.[^.]+$/, '').trim() || 'http'
  return {
    name: `HTTP ${base}`.slice(0, 80),
    variables: [...vars].map(([key, value]) => ({ key, value })),
    requests,
    warnings
  }
}