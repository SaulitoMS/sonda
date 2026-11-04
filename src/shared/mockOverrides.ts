import type { MockRoute } from './mock'

/** Respuesta que el usuario fijó a mano para una ruta del mock */
export interface MockOverride {
  status: number
  /** JSON como texto. Vacío = responder sin body */
  body: string
}

/** Clave: "GET /pet/{petId}" */
export type MockOverrides = Record<string, MockOverride>

/** Sin extensión .json a propósito: ningún lector de peticiones de la app o de la CLI lo toma por una */
export const MOCK_OVERRIDES_FILE = 'sonda.mock'
export const MAX_OVERRIDE_BODY = 200_000

export const overrideKey = (method: string, path: string): string => `${method} ${path}`

const noBody = (status: number): boolean => status < 200 || status === 204 || status === 304

/** Mensaje de error si la respuesta no es válida; null si está bien */
export function overrideError(o: MockOverride): string | null {
  if (!Number.isInteger(o.status) || o.status < 100 || o.status > 599) {
    return 'El status debe ser un entero entre 100 y 599'
  }
  if (o.body.length > MAX_OVERRIDE_BODY) return 'El body es demasiado grande'
  if (o.body.trim()) {
    try {
      JSON.parse(o.body)
    } catch {
      return 'El body debe ser un JSON válido'
    }
  }
  return null
}

/** Valida lo que viene de disco: lo inválido se descarta */
export function normalizeOverrides(raw: unknown): MockOverrides {
  const out: MockOverrides = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const candidate: MockOverride = {
      status: typeof v.status === 'number' ? v.status : NaN,
      body: typeof v.body === 'string' ? v.body : ''
    }
    if (overrideError(candidate) === null) out[key] = candidate
  }
  return out
}

/** Devuelve las rutas con las respuestas fijadas encima. No modifica las originales */
export function applyOverrides(routes: MockRoute[], overrides: MockOverrides): MockRoute[] {
  return routes.map((route) => {
    const o = overrides[overrideKey(route.method, route.path)]
    if (!o) return route
    const body = noBody(o.status) ? '' : o.body.trim() ? o.body : ''
    return {
      ...route,
      status: o.status,
      body,
      // Si alguien fuerza justo ese status con x-sonda-status, también recibe lo fijado
      responses: { ...(route.responses ?? {}), [String(o.status)]: body }
    }
  })
}
