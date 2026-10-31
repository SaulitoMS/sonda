import type { HttpMethod } from '../../../shared/types'

export const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'text-emerald-400',
  POST: 'text-amber-400',
  PUT: 'text-sky-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-red-400',
  HEAD: 'text-zinc-300',
  OPTIONS: 'text-zinc-300'
}

/** Versión "pastilla" (fondo suave + texto) para listas y cabeceras */
export const METHOD_BADGE: Record<HttpMethod, string> = {
  GET: 'bg-emerald-400/10 text-emerald-400',
  POST: 'bg-amber-400/10 text-amber-400',
  PUT: 'bg-sky-400/10 text-sky-400',
  PATCH: 'bg-violet-400/10 text-violet-400',
  DELETE: 'bg-red-400/10 text-red-400',
  HEAD: 'bg-zinc-400/10 text-zinc-300',
  OPTIONS: 'bg-zinc-400/10 text-zinc-300'
}
