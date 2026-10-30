import { inheritedHeaders } from '../../../shared/headers'
import type { CollectionItem } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'

/**
 * Headers que se heredan para una petición, según su carpeta y colección.
 * `path` es la ruta relativa ("coleccion/carpeta/peticion.json"); null = sin guardar.
 */
export function resolveHeadersFor(
  collections: CollectionItem[],
  path: string | null | undefined
): { key: string; value: string }[] {
  const parts = path ? path.split('/') : []
  const collection = collections.find((c) => c.id === parts[0])
  const folder = parts.length > 2 ? collection?.folders.find((f) => f.name === parts[1]) : undefined
  return inheritedHeaders(folder?.headers, collection?.headers)
}

/** Igual que resolveHeadersFor, leyendo las colecciones del store */
export const resolveHeadersForPath = (
  path: string | null | undefined
): { key: string; value: string }[] =>
  resolveHeadersFor(useCollectionsStore.getState().collections, path)
