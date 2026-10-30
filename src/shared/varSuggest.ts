export interface EnvVarInfo {
  name: string
  value: string
  secret: boolean
}

export interface DynamicVarInfo {
  name: string
  description: string
}

export interface VarSuggestion {
  name: string
  kind: 'env' | 'dynamic'
  /** Valor (o "Secreto") en las del entorno; descripción en las dinámicas */
  detail: string
}

export interface OpenVariable {
  /** Posición donde empieza el {{ sin cerrar */
  start: number
  /** Lo escrito después de las llaves, sin espacios */
  query: string
}

/** Si el cursor está dentro de una {{ sin cerrar, dice dónde empezó y qué se lleva escrito */
export function openVariableAt(text: string, cursor: number): OpenVariable | null {
  const before = text.slice(0, cursor)
  const start = before.lastIndexOf('{{')
  if (start === -1) return null

  const typed = before.slice(start + 2)
  if (!/^\s*\$?[\w.-]*$/.test(typed)) return null
  return { start, query: typed.trim() }
}

/** Variables que coinciden con lo escrito: primero las que empiezan igual, luego las que lo contienen */
export function suggestVariables(
  query: string,
  env: EnvVarInfo[],
  dynamic: DynamicVarInfo[],
  limit = 8
): VarSuggestion[] {
  const q = query.toLowerCase()

  const all: VarSuggestion[] = [
    ...env.map((v) => ({
      name: v.name,
      kind: 'env' as const,
      detail: v.secret
        ? 'Secreto'
        : v.value.length > 40
          ? `${v.value.slice(0, 40)}…`
          : v.value || '(vacío)'
    })),
    ...dynamic.map((v) => ({ name: v.name, kind: 'dynamic' as const, detail: v.description }))
  ]

  const rank = (s: VarSuggestion): number => {
    if (!q) return 2
    const n = s.name.toLowerCase()
    if (n.startsWith(q)) return 3
    return n.includes(q) ? 1 : 0
  }

  return all
    .map((s) => ({ s, r: rank(s) }))
    .filter((x) => x.r > 0)
    .sort((a, b) => b.r - a.r)
    .slice(0, limit)
    .map((x) => x.s)
}

/** Qué rango del texto hay que reemplazar y por qué, incluyendo las llaves de cierre que ya existieran */
export function suggestionEdit(
  text: string,
  cursor: number,
  open: OpenVariable,
  name: string
): { from: number; to: number; insert: string } {
  const closing = text.slice(cursor).match(/^\s*\}\}/)
  return {
    from: open.start,
    to: cursor + (closing ? closing[0].length : 0),
    insert: `{{${name}}}`
  }
}

/** Sustituye lo escrito por {{nombre}} y se come las llaves de cierre que ya existieran */
export function applySuggestion(
  text: string,
  cursor: number,
  open: OpenVariable,
  name: string
): { text: string; cursor: number } {
  const { from, to, insert } = suggestionEdit(text, cursor, open, name)
  return {
    text: text.slice(0, from) + insert + text.slice(to),
    cursor: from + insert.length
  }
}
