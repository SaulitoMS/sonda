import type { SavedRequest } from './types'

export type LintSeverity = 'warning' | 'info'

export interface LintIssue {
  id: string
  severity: LintSeverity
  message: string
}

export interface LintEntry {
  /** Ruta del archivo dentro del workspace */
  path: string
  /** Texto para mostrar, ej: "pet / Find pet by ID" */
  label: string
  request: SavedRequest
}

export interface LintResult {
  path: string
  label: string
  issues: LintIssue[]
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i
const WITH_BODY = new Set(['POST', 'PUT', 'PATCH'])

const hasBody = (r: SavedRequest): boolean =>
  r.body.trim() !== '' || (r.bodyForm?.fields ?? []).some((f) => f.enabled)

/** "GET https://x.com/a/?b=1" → "GET https://x.com/a?b=1" (para detectar duplicadas) */
function signature(r: SavedRequest): string {
  return `${r.method} ${r.url.trim().replace(/\/+(?=\?|$)/, '')}`
}

const VARIABLE = /\{\{\s*[^{}]*?\s*\}\}/g

/** Quita las {{variables}} bien formadas; si queda algún "{{" o "}}", hay una llave sin cerrar */
const hasBrokenVariable = (text: string): boolean => /\{\{|\}\}/.test(text.replace(VARIABLE, ''))

/** Un body que parece JSON pero no lo es (las {{variables}} cuentan como un valor válido) */
function isBrokenJson(body: string): boolean {
  const text = body.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return false
  try {
    JSON.parse(text.replace(VARIABLE, '0'))
    return false
  } catch {
    return true
  }
}

/** Revisa una petición por sí sola */
export function lintRequest(r: SavedRequest): LintIssue[] {
  const out: LintIssue[] = []
  const url = r.url.trim()

  if (!url) {
    out.push({ id: 'empty-url', severity: 'warning', message: 'La URL está vacía' })
  } else {
    if (/\s/.test(url.replace(VARIABLE, ''))) {
      out.push({
        id: 'url-with-spaces',
        severity: 'warning',
        message: 'La URL contiene espacios; codifícalos (%20) o quítalos'
      })
    }
    if (hasBrokenVariable(url)) {
      out.push({
        id: 'broken-variable',
        severity: 'warning',
        message: 'La URL tiene una variable mal escrita (falta "{{" o "}}")'
      })
    }
  }

  const host = /^https?:\/\/([^/?#:]+)/i.exec(url)?.[1]
  if (host && !LOCAL_HOST.test(host)) {
    out.push({
      id: 'hardcoded-host',
      severity: 'warning',
      message: `El host "${host}" está escrito a mano; usa {{baseUrl}} para poder cambiar de entorno`
    })
  }

  if ((r.method === 'GET' || r.method === 'HEAD') && hasBody(r)) {
    out.push({
      id: 'get-with-body',
      severity: 'warning',
      message: `${r.method} con body: muchos servidores lo ignoran o lo rechazan`
    })
  }

  if (WITH_BODY.has(r.method) && !hasBody(r)) {
    out.push({ id: 'write-without-body', severity: 'info', message: `${r.method} sin body` })
  }

  if (!r.bodyForm && isBrokenJson(r.body)) {
    out.push({
      id: 'invalid-json-body',
      severity: 'warning',
      message: 'El body parece JSON pero no es válido (coma de más, comilla sin cerrar…)'
    })
  }

  const seen = new Set<string>()
  for (const h of r.headers) {
    const key = h.key.trim().toLowerCase()
    if (!h.enabled || !key) continue
    if (seen.has(key)) {
      out.push({
        id: 'duplicate-header',
        severity: 'warning',
        message: `Header "${h.key.trim()}" repetido y activo`
      })
    }
    seen.add(key)
  }

  if (!(r.assertions?.length ?? 0) && !r.responseSchemas) {
    out.push({
      id: 'no-checks',
      severity: 'info',
      message: 'Sin aserciones ni schema: nada comprueba la respuesta'
    })
  }

  return out
}

/** Revisa todas las peticiones y detecta las repetidas (mismo método y URL). Solo devuelve las que tienen avisos */
export function lintCollection(entries: LintEntry[]): LintResult[] {
  const bySignature = new Map<string, LintEntry[]>()
  for (const e of entries) {
    const sig = signature(e.request)
    bySignature.set(sig, [...(bySignature.get(sig) ?? []), e])
  }

  return entries
    .map((e): LintResult => {
      const issues = lintRequest(e.request)
      const twins = bySignature.get(signature(e.request)) ?? []
      if (twins.length > 1) {
        issues.unshift({
          id: 'duplicate-request',
          severity: 'warning',
          message: `Repetida: ${twins.length - 1} petición(es) más con el mismo método y URL`
        })
      }
      return { path: e.path, label: e.label, issues }
    })
    .filter((r) => r.issues.length > 0)
}
