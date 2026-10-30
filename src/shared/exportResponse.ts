import type { HttpMethod, SendRequestResult } from './types'

type OkResponse = Extract<SendRequestResult, { ok: true }>

/** Extensión según el Content-Type; si no ayuda, mira si el body es JSON */
export function extensionFor(contentType: string | undefined, body: string): string {
  const ct = (contentType ?? '').toLowerCase()
  if (ct.includes('json')) return 'json'
  if (ct.includes('html')) return 'html'
  if (ct.includes('xml')) return 'xml'
  if (ct.includes('csv')) return 'csv'
  if (ct.startsWith('text/')) return 'txt'
  try {
    JSON.parse(body)
    return 'json'
  } catch {
    return 'txt'
  }
}

export function mimeFor(ext: string): string {
  switch (ext) {
    case 'json':
      return 'application/json'
    case 'html':
      return 'text/html'
    case 'xml':
      return 'application/xml'
    case 'csv':
      return 'text/csv'
    default:
      return 'text/plain'
  }
}

/** Ej: get-pet-1-20261029-1530.json */
export function suggestFileName(
  method: HttpMethod,
  url: string,
  ext: string,
  now = new Date()
): string {
  const path = url
    .trim()
    .replace(/^\{\{[^}]*\}\}/, '')
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i, '')
    .split(/[?#]/)[0]

  const slug =
    path
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\{\{|\}\}/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'respuesta'

  const p = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`
  return `${method.toLowerCase()}-${slug}-${stamp}.${ext}`
}

/** Petición + respuesta en un solo JSON. La URL va sin resolver, así que no filtra secretos */
export function buildFullExport(
  request: { method: HttpMethod; url: string },
  res: OkResponse
): string {
  let body: unknown = res.body
  try {
    body = JSON.parse(res.body)
  } catch {
    // no es JSON: se exporta como texto
  }
  return (
    JSON.stringify(
      {
        request,
        response: {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
          body,
          timeMs: res.timeMs,
          sizeBytes: res.sizeBytes
        }
      },
      null,
      2
    ) + '\n'
  )
}