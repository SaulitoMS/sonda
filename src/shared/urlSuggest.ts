import type { HttpMethod } from './types'

export interface UrlSuggestion {
  url: string
  method: HttpMethod
}

/** Máximo de URLs que se ofrecen en la lista */
export const MAX_URL_SUGGESTIONS = 50

/**
 * URLs recientes únicas para autocompletar la barra de URL.
 * Se guardan sin query ni hash (ahí suelen ir tokens) y se descartan las que llevan usuario:contraseña.
 * `entries` debe venir de la más nueva a la más vieja, como lo guarda el historial.
 */
export function recentUrls(
  entries: { method: HttpMethod; url: string }[],
  limit = MAX_URL_SUGGESTIONS
): UrlSuggestion[] {
  const seen = new Set<string>()
  const out: UrlSuggestion[] = []

  for (const entry of entries) {
    const raw = entry.url.trim()
    if (!raw || /\/\/[^/?#]*@/.test(raw)) continue

    const url = raw.replace(/[?#].*$/, '')
    if (!url || seen.has(url)) continue

    seen.add(url)
    out.push({ url, method: entry.method })
    if (out.length >= limit) break
  }
  return out
}
