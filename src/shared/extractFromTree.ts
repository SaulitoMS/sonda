import { getByPath, parsePath } from './assertions'
import { emptyExtraction, isValidVariableName } from './extract'
import type { Extraction } from './types'

/** Nombre de variable sugerido a partir de la ruta: el último campo, sin índices. "data.user_id" → "user_id" */
export function suggestVariableName(path: string): string {
  const name = /([A-Za-z_][\w-]*)(?:\[\d+\])*$/.exec(path)?.[1]
  return name && isValidVariableName(name) ? name : 'valor'
}

/** ¿La ruta del árbol apunta de verdad a ese valor? Falla con claves que llevan puntos o corchetes */
export function pathReaches(root: unknown, path: string, value: unknown): boolean {
  const tokens = parsePath(path)
  if (!tokens || tokens.length === 0) return false
  const found = getByPath(root, tokens)
  return found.found && Object.is(found.value, value)
}

function uniqueName(list: Extraction[], base: string): string {
  const used = new Set(list.map((e) => e.variable.trim()))
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}${n}`)) n++
  return `${base}${n}`
}

/** Agrega una regla que extrae `path` del body. Devuelve null si ya existía una para esa ruta */
export function addBodyExtraction(list: Extraction[], path: string): Extraction[] | null {
  if (list.some((e) => e.source === 'body' && e.path.trim() === path)) return null
  const rule: Extraction = {
    ...emptyExtraction(),
    path,
    variable: uniqueName(list, suggestVariableName(path))
  }
  return [...list, rule]
}
