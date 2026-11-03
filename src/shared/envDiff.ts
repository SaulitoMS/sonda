import type { Environment } from './types'

export type EnvDiffStatus = 'different' | 'onlyA' | 'onlyB' | 'same'

export interface EnvDiffRow {
  key: string
  status: EnvDiffStatus
  /** Valor en el entorno A (undefined si no existe ahí) */
  a?: string
  /** Valor en el entorno B (undefined si no existe ahí) */
  b?: string
  /** Alguno de los dos lados es secreto: la interfaz debe ocultar los valores */
  secret: boolean
  /** La variable del lado B es secreta (para copiarla a A con el mismo flag) */
  secretB: boolean
}

const ORDER: Record<EnvDiffStatus, number> = { different: 0, onlyA: 1, onlyB: 2, same: 3 }

/** Compara las variables activas de dos entornos. Primero salen las diferencias. */
export function diffEnvironments(a: Environment, b: Environment): EnvDiffRow[] {
  const active = (env: Environment): Map<string, { value: string; secret: boolean }> => {
    const m = new Map<string, { value: string; secret: boolean }>()
    for (const v of env.variables) {
      const key = v.key.trim()
      if (key && v.enabled) m.set(key, { value: v.value, secret: v.secret })
    }
    return m
  }
  const ma = active(a)
  const mb = active(b)
  const rows: EnvDiffRow[] = []

  for (const key of new Set([...ma.keys(), ...mb.keys()])) {
    const va = ma.get(key)
    const vb = mb.get(key)
    const status: EnvDiffStatus = !vb
      ? 'onlyA'
      : !va
        ? 'onlyB'
        : va.value === vb.value
          ? 'same'
          : 'different'
    rows.push({
      key,
      status,
      a: va?.value,
      b: vb?.value,
      secret: Boolean(va?.secret || vb?.secret),
      secretB: Boolean(vb?.secret)
    })
  }

  return rows.sort((x, y) => ORDER[x.status] - ORDER[y.status] || x.key.localeCompare(y.key))
}
