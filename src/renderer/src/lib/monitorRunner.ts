import { classifyResult, type RunStatus } from '../../../shared/classify'
import { summarizeRun, type MonitorRun } from '../../../shared/monitor'
import type { HttpMethod } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { persistExtractions } from './persistExtractions'
import { executeRequest } from './runRequest'

/** El monitor nunca modifica datos: solo peticiones de lectura */
export const SAFE_METHODS: HttpMethod[] = ['GET', 'HEAD', 'OPTIONS']

export function safeRequestsOf(collectionId: string): { path: string; name: string }[] {
  const collection = useCollectionsStore.getState().collections.find((c) => c.id === collectionId)
  if (!collection) return []
  return [...collection.folders.flatMap((f) => f.requests), ...collection.requests].filter((r) =>
    SAFE_METHODS.includes(r.method)
  )
}

/** Ejecuta una vez las peticiones seguras de la colección y resume el resultado */
export async function runMonitorOnce(collectionId: string): Promise<MonitorRun> {
  const startedAt = performance.now()
  const collection = useCollectionsStore.getState().collections.find((c) => c.id === collectionId)

  if (!collection) {
    return summarizeRun({
      collection: '(colección eliminada)',
      rows: [{ name: 'Monitor', status: 'fail', detail: 'La colección ya no existe.', timeMs: 0 }],
      elapsedMs: 0
    })
  }

  const rows: { name: string; status: RunStatus; detail: string; timeMs: number }[] = []

  for (const item of safeRequestsOf(collectionId)) {
    // El entorno se lee en cada vuelta: una petición anterior pudo guardar variables (ej: token)
    const env = useEnvironmentStore.getState().getActive()
    try {
      const saved = await window.api.readRequest(item.path)
      const { response, validation, requestValidation, assertionResults, extractions } =
        await executeRequest(saved, env, { path: item.path })
      await persistExtractions(extractions)
      const verdict = classifyResult(response, validation, assertionResults, requestValidation)
      rows.push({
        name: item.name,
        status: verdict.status,
        detail: verdict.detail,
        timeMs: response.timeMs
      })
    } catch (err) {
      rows.push({
        name: item.name,
        status: 'fail',
        detail: err instanceof Error ? err.message : 'Error desconocido',
        timeMs: 0
      })
    }
  }

  return summarizeRun({
    collection: collection.name,
    rows,
    elapsedMs: Math.round(performance.now() - startedAt)
  })
}