import { resolveAuth, type ResolvedAuth } from '../../../shared/auth'
import type { AuthConfig, CollectionItem } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'

export interface InheritedAuth extends ResolvedAuth {
  /** Nombre de la carpeta o colección de donde salió (vacío si viene de la petición o no hay) */
  sourceName: string
}

/**
 * Auth que se aplica a una petición: la suya o, si hereda, la de su carpeta / colección.
 * `path` es la ruta relativa de la petición ("coleccion/carpeta/peticion.json"); null = sin guardar.
 */
export function resolveAuthFor(
  collections: CollectionItem[],
  own: AuthConfig | null | undefined,
  path: string | null | undefined
): InheritedAuth {
  const parts = path ? path.split('/') : []
  const collection = collections.find((c) => c.id === parts[0])
  const folder = parts.length > 2 ? collection?.folders.find((f) => f.name === parts[1]) : undefined

  const resolved = resolveAuth(own, folder?.auth, collection?.auth)
  const sourceName =
    resolved.source === 'folder'
      ? (folder?.name ?? '')
      : resolved.source === 'collection'
        ? (collection?.name ?? '')
        : ''
  return { ...resolved, sourceName }
}

/** Igual que resolveAuthFor, leyendo las colecciones del store (para usar fuera de componentes) */
export const resolveAuthForPath = (
  own: AuthConfig | null | undefined,
  path: string | null | undefined
): InheritedAuth => resolveAuthFor(useCollectionsStore.getState().collections, own, path)
