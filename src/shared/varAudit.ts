import type { AuthConfig, EnvVariable, Environment, KeyValueData, SavedRequest } from './types'

// Solo variables de entorno: las {{$dinámicas}} no se definen en ningún lado
const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g
// sonda.env.set('nombre', ...) dentro de los scripts también crea variables
const SET_RE = /env\.set\(\s*['"`]([\w.-]+)['"`]/g

export function namesIn(text: string | undefined): string[] {
  if (!text) return []
  return [...text.matchAll(VAR_RE)].map((m) => m[1])
}

export const enabledPairs = (list: KeyValueData[] | undefined): string[] =>
  (list ?? []).filter((h) => h.enabled).flatMap((h) => [h.key, h.value])

export function authTexts(a: AuthConfig | undefined): string[] {
  if (!a || a.type === 'none') return []
  return [
    a.token,
    a.username,
    a.password,
    a.keyName,
    a.keyValue,
    a.oauthTokenUrl ?? '',
    a.oauthClientId ?? '',
    a.oauthScope ?? '',
    a.oauthUsername ?? '',
    a.oauthPassword ?? ''
  ]
}

/** Todos los textos de una petición que pueden llevar {{variables}} */
export function requestTexts(r: SavedRequest): string[] {
  return [
    r.url,
    r.body,
    ...enabledPairs(r.headers),
    ...(r.bodyForm?.fields ?? []).filter((f) => f.enabled).flatMap((f) => [f.key, f.value]),
    ...authTexts(r.auth)
  ]
}

export interface AuditRequest {
  label: string
  saved: SavedRequest
}

export interface AuditGroup {
  /** Nombre de la colección */
  name: string
  /** Variables de la colección */
  vars: KeyValueData[]
  /** Textos heredados: headers y auth de la colección y sus carpetas */
  inherited: string[]
  requests: AuditRequest[]
}

export interface UndefinedVar {
  name: string
  usedIn: string[]
}

export interface UnusedVar {
  name: string
  /** Dónde está definida: nombres de entornos o "Colección: X" */
  where: string[]
}

export interface VarAuditResult {
  undefinedVars: UndefinedVar[]
  unusedVars: UnusedVar[]
}

export function auditVariables(
  groups: AuditGroup[],
  environments: Environment[],
  globals: EnvVariable[] = []
): VarAuditResult {
  // Definidas para todos: entornos, globales, extracciones y scripts que hacen env.set
  const globalDefined = new Set<string>()
  const scriptText: string[] = []
  const envDefs = new Map<string, string[]>()

  for (const env of environments) {
    for (const v of env.variables) {
      const key = v.key.trim()
      if (!v.enabled || !key) continue
      globalDefined.add(key)
      envDefs.set(key, [...(envDefs.get(key) ?? []), env.name])
    }
  }
  for (const v of globals) {
    const key = v.key.trim()
    if (!v.enabled || !key) continue
    globalDefined.add(key)
    envDefs.set(key, [...(envDefs.get(key) ?? []), 'Globales'])
  }

  for (const g of groups) {
    for (const { saved } of g.requests) {
      for (const e of saved.extractions ?? []) {
        if (e.enabled && e.variable.trim()) globalDefined.add(e.variable.trim())
      }
      for (const script of [saved.preScript, saved.postScript]) {
        if (!script) continue
        scriptText.push(script)
        for (const m of script.matchAll(SET_RE)) globalDefined.add(m[1])
      }
    }
  }

  const usedAnywhere = new Set<string>()
  const undefinedMap = new Map<string, Set<string>>()
  const unusedVars: UnusedVar[] = []
  const usedInScripts = (name: string): boolean => scriptText.some((s) => s.includes(name))

  for (const g of groups) {
    const defined = new Set(globalDefined)
    const groupVars = g.vars.filter((v) => v.enabled && v.key.trim()).map((v) => v.key.trim())
    groupVars.forEach((k) => defined.add(k))

    const usedInGroup = new Set<string>()
    const note = (name: string, label: string): void => {
      usedInGroup.add(name)
      usedAnywhere.add(name)
      if (!defined.has(name)) {
        const set = undefinedMap.get(name) ?? new Set<string>()
        set.add(label)
        undefinedMap.set(name, set)
      }
    }

    for (const text of g.inherited) for (const n of namesIn(text)) note(n, `${g.name} (heredado)`)
    for (const { label, saved } of g.requests) {
      for (const text of requestTexts(saved)) {
        for (const n of namesIn(text)) note(n, `${g.name} / ${label}`)
      }
    }

    for (const key of groupVars) {
      if (!usedInGroup.has(key) && !usedInScripts(key)) {
        unusedVars.push({ name: key, where: [`Colección: ${g.name}`] })
      }
    }
  }

  for (const [key, where] of envDefs) {
    if (!usedAnywhere.has(key) && !usedInScripts(key)) unusedVars.push({ name: key, where })
  }

  return {
    undefinedVars: [...undefinedMap]
      .map(([name, set]) => ({ name, usedIn: [...set] }))
      .sort((a, b) => b.usedIn.length - a.usedIn.length || a.name.localeCompare(b.name)),
    unusedVars: unusedVars.sort((a, b) => a.name.localeCompare(b.name))
  }
}
