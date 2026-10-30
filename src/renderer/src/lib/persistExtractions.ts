import { applyExtractions } from '../../../shared/extract'
import type { ExtractionResult } from '../../../shared/types'
import { useEnvironmentStore } from '../store/useEnvironmentStore'

/**
 * Guarda en el entorno activo los valores que se extrajeron de una respuesta.
 * Devuelve avisos si no se pudo guardar (sin entorno activo, o error al persistir).
 */
export async function persistExtractions(results: ExtractionResult[]): Promise<string[]> {
  const succeeded = results.filter((r) => r.ok)
  if (succeeded.length === 0) return []

  const store = useEnvironmentStore.getState()
  const active = store.getActive()
  if (!active) {
    const names = succeeded.map((r) => `{{${r.variable}}}`).join(', ')
    return [`No se guardó ${names}: selecciona o crea un entorno en la cabecera.`]
  }

  const { env, changed } = applyExtractions(active, succeeded)
  if (!changed) return []

  try {
    await store.save({
      ...store.data,
      environments: store.data.environments.map((e) => (e.id === env.id ? env : e))
    })
    return []
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'error desconocido'
    return [`No se pudo guardar en el entorno "${active.name}": ${reason}`]
  }
}
