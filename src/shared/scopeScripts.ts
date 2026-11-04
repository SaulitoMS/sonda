import type { ScopeScripts } from './types'

/**
 * Une los scripts de la colección, la carpeta y la petición, en ese orden.
 * Si hay más de uno, cada uno va en su propio bloque { }: así pueden declarar las mismas
 * const / let sin chocar. Con uno solo se devuelve tal cual, como antes de existir los scripts heredados.
 */
export function composeScripts(parts: (string | undefined | null)[]): string {
  const active = parts.map((p) => p?.trim() ?? '').filter(Boolean)
  if (active.length === 0) return ''
  if (active.length === 1) return active[0]
  return active.map((code) => `{\n${code}\n}`).join('\n')
}

/** Script de una fase (pre o post): colección → carpeta → petición */
export function scriptForPhase(
  phase: 'pre' | 'post',
  own: string | undefined | null,
  folder?: ScopeScripts,
  collection?: ScopeScripts
): string {
  return composeScripts([collection?.[phase], folder?.[phase], own])
}

/** Versión limpia para guardar: sin scripts vacíos. undefined si no queda nada */
export function cleanScopeScripts(
  scripts: ScopeScripts | null | undefined
): ScopeScripts | undefined {
  const pre = scripts?.pre?.trim() ? scripts.pre : undefined
  const post = scripts?.post?.trim() ? scripts.post : undefined
  if (!pre && !post) return undefined
  return { ...(pre ? { pre } : {}), ...(post ? { post } : {}) }
}
