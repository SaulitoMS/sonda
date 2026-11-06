export type InsightLevel = 'ok' | 'warn' | 'info'

export interface HeaderInsight {
  id: string
  group: 'cache' | 'limits' | 'performance'
  level: InsightLevel
  title: string
  detail: string
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const pick = (h: Record<string, string>, names: string[]): string | undefined => {
  for (const n of names) if (h[n] !== undefined) return h[n]
  return undefined
}

export function humanSeconds(s: number): string {
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400) return `${(s / 3600).toFixed(1)} h`
  return `${(s / 86400).toFixed(1)} días`
}

/** Segundos que faltan para un valor de reset: segundos relativos, epoch en segundos o fecha HTTP */
function secondsUntil(value: string, now: number): number | null {
  const n = num(value)
  if (n !== null) return Math.max(0, Math.round(n > 1_000_000_000 ? n - now / 1000 : n))
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : Math.max(0, Math.round((t - now) / 1000))
}

function parseCacheControl(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (raw ?? '').split(',')) {
    const [k, ...v] = part.trim().split('=')
    if (k) out[k.toLowerCase()] = v.join('=').replace(/"/g, '')
  }
  return out
}

export function analyzeHeaders(
  headers: Record<string, string>,
  method: string,
  status: number,
  now: number = Date.now()
): HeaderInsight[] {
  const out: HeaderInsight[] = []
  const add = (i: HeaderInsight): void => {
    out.push(i)
  }

  /* ---------- Límites de uso ---------- */
  let limit = num(pick(headers, ['x-ratelimit-limit', 'x-rate-limit-limit', 'ratelimit-limit']))
  let remaining = num(
    pick(headers, ['x-ratelimit-remaining', 'x-rate-limit-remaining', 'ratelimit-remaining'])
  )
  let reset = pick(headers, ['x-ratelimit-reset', 'x-rate-limit-reset', 'ratelimit-reset'])

  // Formato estructurado: RateLimit: limit=100, remaining=50, reset=30
  const combined = headers['ratelimit']
  if (combined) {
    limit ??= num(combined.match(/limit=(\d+)/i)?.[1])
    remaining ??= num(combined.match(/remaining=(\d+)/i)?.[1])
    reset ??= combined.match(/reset=(\d+)/i)?.[1]
  }

  const resetIn = reset !== undefined ? secondsUntil(reset, now) : null
  const resetText = resetIn !== null ? `Se reinicia en ${humanSeconds(resetIn)}.` : ''

  if (limit !== null && remaining !== null) {
    const ratio = limit > 0 ? remaining / limit : 1
    add({
      id: 'rate-usage',
      group: 'limits',
      level: remaining === 0 || ratio < 0.1 ? 'warn' : 'ok',
      title: `Quedan ${remaining} de ${limit} peticiones (${Math.round(ratio * 100)}%)`,
      detail:
        remaining === 0
          ? `Ya agotaste el cupo: la siguiente petición probablemente devuelva 429. ${resetText}`
          : resetText || 'La API no indica cuándo se reinicia el cupo.'
    })
  } else if (limit !== null || remaining !== null) {
    add({
      id: 'rate-partial',
      group: 'limits',
      level: 'info',
      title:
        limit !== null
          ? `Límite declarado: ${limit} peticiones`
          : `Peticiones restantes: ${remaining}`,
      detail: resetText || 'La API no manda el resto de headers de límite.'
    })
  }

  const retryAfter = headers['retry-after']
  if (retryAfter !== undefined) {
    const wait = secondsUntil(retryAfter, now)
    add({
      id: 'retry-after',
      group: 'limits',
      level: 'warn',
      title:
        wait !== null ? `El servidor pide esperar ${humanSeconds(wait)}` : 'Retry-After presente',
      detail: `Retry-After: ${retryAfter}. Reintenta después de ese tiempo.`
    })
  } else if (status === 429) {
    add({
      id: 'rate-429-no-retry',
      group: 'limits',
      level: 'warn',
      title: '429 sin Retry-After',
      detail: 'La API te limita pero no dice cuánto esperar. Usa un backoff exponencial.'
    })
  }

  /* ---------- Caché (solo GET / HEAD) ---------- */
  if (method === 'GET' || method === 'HEAD') {
    const cc = parseCacheControl(headers['cache-control'])
    const etag = headers['etag']
    const lastModified = headers['last-modified']
    const maxAge = num(cc['s-maxage']) ?? num(cc['max-age'])

    if ('no-store' in cc) {
      add({
        id: 'cache-no-store',
        group: 'cache',
        level: 'info',
        title: 'No se guarda en caché (no-store)',
        detail: 'Ningún navegador ni proxy debe almacenar esta respuesta. Típico en datos privados.'
      })
    } else if (maxAge !== null && maxAge > 0 && !('no-cache' in cc)) {
      const scope = 'private' in cc ? 'solo en el cliente (private)' : 'compartible (public)'
      add({
        id: 'cache-max-age',
        group: 'cache',
        level: 'ok',
        title: `Cacheable durante ${humanSeconds(maxAge)}`,
        detail: `Alcance: ${scope}.${'immutable' in cc ? ' Marcada como immutable: no cambia.' : ''}`
      })
    } else if ('no-cache' in cc || maxAge === 0) {
      add({
        id: 'cache-revalidate',
        group: 'cache',
        level: 'info',
        title: 'Se debe revalidar en cada uso',
        detail: 'Se puede guardar, pero antes de reutilizarla hay que preguntarle al servidor.'
      })
    } else if (!etag && !lastModified && status >= 200 && status < 300) {
      add({
        id: 'cache-none',
        group: 'cache',
        level: 'warn',
        title: 'Sin política de caché declarada',
        detail:
          'No hay Cache-Control, ETag ni Last-Modified. Cada cliente decide por su cuenta si cachea.'
      })
    }

    if (etag || lastModified) {
      add({
        id: 'cache-conditional',
        group: 'cache',
        level: 'ok',
        title: `Soporta peticiones condicionales (${etag ? 'ETag' : 'Last-Modified'})`,
        detail: etag
          ? `Reenvía el valor en If-None-Match y el servidor puede responder 304 sin body. ETag: ${etag}`
          : `Reenvía el valor en If-Modified-Since y el servidor puede responder 304. Last-Modified: ${lastModified}`
      })
    }
    if (headers['age'] !== undefined) {
      add({
        id: 'cache-age',
        group: 'cache',
        level: 'info',
        title: `Servida desde una caché intermedia (Age: ${headers['age']} s)`,
        detail: 'Un proxy o CDN ya tenía esta respuesta guardada.'
      })
    }
    if (headers['vary']) {
      add({
        id: 'cache-vary',
        group: 'cache',
        level: 'info',
        title: `La caché varía según: ${headers['vary']}`,
        detail: 'Si cambias alguno de esos headers en la petición, puedes recibir otra versión.'
      })
    }
  }

  return out
}
