import { scriptForPhase } from '../../../shared/scopeScripts'
import type { CollectionItem } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'

/**
 * Script de una fase para una petición: el de su colección, el de su carpeta y el propio, en ese orden.
 * `path` es la ruta relativa ("coleccion/carpeta/peticion.json"); null = sin guardar.
 */
export function resolveScriptFor(
  collections: CollectionItem[],
  path: string | null | undefined,
  phase: 'pre' | 'post',
  own: string | null | undefined
): string {
  const parts = path ? path.split('/') : []
  const collection = collections.find((c) => c.id === parts[0])
  const folder = parts.length > 2 ? collection?.folders.find((f) => f.name === parts[1]) : undefined
  return scriptForPhase(phase, own, folder?.scripts, collection?.scripts)
}

/** Igual que resolveScriptFor, leyendo las colecciones del store */
export const resolveScriptForPath = (
  path: string | null | undefined,
  phase: 'pre' | 'post',
  own: string | null | undefined
): string => resolveScriptFor(useCollectionsStore.getState().collections, path, phase, own)
