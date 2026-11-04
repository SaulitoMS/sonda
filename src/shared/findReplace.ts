import type { AuthConfig, SavedRequest } from './types'

export type ReplaceScope = 'url' | 'headers' | 'body' | 'auth' | 'scripts'

export const REPLACE_SCOPES: { id: ReplaceScope; label: string }[] = [
  { id: 'url', label: 'URL' },
  { id: 'headers', label: 'Headers' },
  { id: 'body', label: 'Body' },
  { id: 'auth', label: 'Auth' },
  { id: 'scripts', label: 'Scripts' }
]

export interface FindReplaceOptions {
  find: string
  replace: string
  caseSensitive: boolean
  useRegex: boolean
  scopes: ReplaceScope[]
}

export interface FieldChange {
  /** Ej: "URL", "Header: Authorization", "Body" */
  field: string
  before: string
  after: string
  count: number
}

export interface ReplaceResult {
  request: SavedRequest
  /** Total de coincidencias reemplazadas en la petición */
  count: number
  changes: FieldChange[]
}

type Matcher =
  | { ok: true; run: (text: string) => { text: string; count: number } }
  | { ok: false; error: string }

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Prepara la búsqueda una sola vez. Devuelve un error legible si la regex no es válida. */
export function makeMatcher(
  opts: Pick<FindReplaceOptions, 'find' | 'replace' | 'caseSensitive' | 'useRegex'>
): Matcher {
  if (!opts.find) return { ok: false, error: '' }
  let re: RegExp
  try {
    re = new RegExp(
      opts.useRegex ? opts.find : escapeRe(opts.find),
      opts.caseSensitive ? 'g' : 'gi'
    )
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Expresión regular no válida' }
  }
  return {
    ok: true,
    run: (text) => {
      let count = 0
      // Con regex, $1, $2… funcionan; en texto literal, el reemplazo se usa tal cual
      const out = text.replace(re, (...args) => {
        count++
        if (!opts.useRegex) return opts.replace
        const groups = args
          .slice(0, -2)
          .filter((a) => typeof a === 'string' || a === undefined) as (string | undefined)[]
        return opts.replace.replace(/\$(\d{1,2}|&)/g, (_m, g: string) =>
          g === '&' ? (groups[0] ?? '') : (groups[Number(g)] ?? '')
        )
      })
      return { text: out, count }
    }
  }
}

const AUTH_FIELDS: (keyof AuthConfig)[] = [
  'token',
  'username',
  'password',
  'keyName',
  'keyValue',
  'oauthTokenUrl',
  'oauthClientId',
  'oauthClientSecret',
  'oauthScope',
  'oauthUsername',
  'oauthPassword',
  'awsRegion',
  'awsService'
]

/** Aplica la búsqueda y el reemplazo a una petición (no modifica la original) */
export function replaceInRequest(req: SavedRequest, opts: FindReplaceOptions): ReplaceResult {
  const matcher = makeMatcher(opts)
  const changes: FieldChange[] = []
  if (!matcher.ok) return { request: req, count: 0, changes }

  const scopes = new Set(opts.scopes)
  const apply = (label: string, text: string | undefined): string | undefined => {
    if (!text) return text
    const r = matcher.run(text)
    if (r.count === 0) return text
    changes.push({ field: label, before: text, after: r.text, count: r.count })
    return r.text
  }

  const next: SavedRequest = { ...req }
  if (scopes.has('url')) next.url = apply('URL', req.url) ?? ''
  if (scopes.has('headers')) {
    next.headers = req.headers.map((h) => ({
      ...h,
      key: apply(`Header (nombre): ${h.key}`, h.key) ?? '',
      value: apply(`Header: ${h.key}`, h.value) ?? ''
    }))
  }
  if (scopes.has('body')) {
    next.body = apply('Body', req.body) ?? ''
    if (req.bodyForm) {
      next.bodyForm = {
        ...req.bodyForm,
        fields: req.bodyForm.fields.map((f) =>
          f.type === 'text'
            ? {
                ...f,
                key: apply(`Campo (nombre): ${f.key}`, f.key) ?? '',
                value: apply(`Campo: ${f.key}`, f.value) ?? ''
              }
            : f
        )
      }
    }
  }
  if (scopes.has('auth') && req.auth) {
    const auth = { ...req.auth }
    for (const f of AUTH_FIELDS) {
      const v = auth[f]
      if (typeof v === 'string') (auth as Record<string, unknown>)[f] = apply(`Auth: ${f}`, v) ?? ''
    }
    next.auth = auth
  }
  if (scopes.has('scripts')) {
    if (req.preScript !== undefined) next.preScript = apply('Pre-script', req.preScript)
    if (req.postScript !== undefined) next.postScript = apply('Post-script', req.postScript)
  }

  const count = changes.reduce((n, c) => n + c.count, 0)
  return { request: count > 0 ? next : req, count, changes }
}
