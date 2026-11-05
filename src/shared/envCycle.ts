import type { Environment } from './types'

/**
 * Id del siguiente (1) o anterior (-1) entorno, de forma circular.
 * "Sin entorno" (null) también es una parada del ciclo.
 */
export function nextEnvironmentId(
  environments: Pick<Environment, 'id'>[],
  activeId: string | null,
  step: 1 | -1
): string | null {
  const stops: (string | null)[] = [null, ...environments.map((e) => e.id)]
  const current = stops.indexOf(activeId)
  const from = current === -1 ? 0 : current // un id que ya no existe cuenta como "sin entorno"
  return stops[(from + step + stops.length) % stops.length]
}
