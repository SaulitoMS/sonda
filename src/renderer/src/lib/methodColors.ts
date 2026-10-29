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
