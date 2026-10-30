export interface QueryParam {
  key: string
  value: string
}

interface UrlParts {
  base: string
  query: string
  hash: string
}

function splitUrl(url: string): UrlParts {
  const hashIdx = url.indexOf('#')
  const hash = hashIdx >= 0 ? url.slice(hashIdx) : ''
  const rest = hashIdx >= 0 ? url.slice(0, hashIdx) : url
  const qIdx = rest.indexOf('?')
  return {
    base: qIdx >= 0 ? rest.slice(0, qIdx) : rest,
    query: qIdx >= 0 ? rest.slice(qIdx + 1) : '',
    hash
  }
}

/**
 * Lee los parámetros de query de una URL. No decodifica nada, así que
 * {{variables}} y valores ya codificados se conservan tal cual.
 */
export function parseQuery(url: string): QueryParam[] {
  const { query } = splitUrl(url)
  return query
    .split('&')
    .filter((part) => part !== '')
    .map((part) => {
      const i = part.indexOf('=')
      return i < 0 ? { key: part, value: '' } : { key: part.slice(0, i), value: part.slice(i + 1) }
    })
}

// Solo se escapa lo que rompería la estructura de la URL
const escapeValue = (s: string): string => s.replace(/&/g, '%26').replace(/#/g, '%23')
const escapeKey = (s: string): string => escapeValue(s).replace(/=/g, '%3D')

/** Reemplaza la query de la URL por los parámetros dados (las filas vacías se ignoran) */
export function applyQuery(url: string, params: QueryParam[]): string {
  const { base, hash } = splitUrl(url)
  const parts = params
    .filter((p) => p.key !== '' || p.value !== '')
    .map((p) => `${escapeKey(p.key)}=${escapeValue(p.value)}`)
  return base + (parts.length ? `?${parts.join('&')}` : '') + hash
}

const VAR_SPLIT = /(\{\{\s*\$?[\w.-]+\s*\}\})/

// Codifica el texto pero deja intactas las {{variables}} (se resuelven después)
const encodePart = (text: string): string =>
  text
    .split(VAR_SPLIT)
    .map((part, i) => (i % 2 === 1 ? part : encodeURIComponent(part)))
    .join('')

/** Agrega parámetros a la URL (codificándolos) sin tocar los que ya tiene */
export function appendQuery(url: string, extra: QueryParam[]): string {
  if (extra.length === 0) return url
  const current = parseQuery(url)
  const added = extra.map((p) => ({ key: encodePart(p.key), value: encodePart(p.value) }))
  return applyQuery(url, [...current, ...added])
}
