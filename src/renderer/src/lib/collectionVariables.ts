import { useMemo } from 'react'
import { withCollectionVariables, withGlobalVariables } from '../../../shared/variables'
import type { Environment, KeyValueData } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'

/** Variables de la colección a la que pertenece una petición ("coleccion/…/peticion.json") */
export function collectionVarsForPath(path: string | null | undefined): KeyValueData[] | undefined {
  const id = path?.split('/')[0]
  if (!id) return undefined
  return useCollectionsStore.getState().collections.find((c) => c.id === id)?.variables
}

/** Entorno activo + variables de la colección de la pestaña abierta + globales (para resaltar en los campos) */
export function useEffectiveEnv(): Environment | null {
  const data = useEnvironmentStore((s) => s.data)
  const currentFile = useRequestStore((s) => s.currentFile)
  const collections = useCollectionsStore((s) => s.collections)

  return useMemo(() => {
    const env = data.environments.find((e) => e.id === data.activeId) ?? null
    const id = currentFile?.split('/')[0]
    const withCollection = withCollectionVariables(
      env,
      collections.find((c) => c.id === id)?.variables
    )
    return withGlobalVariables(withCollection, data.globals)
  }, [data, currentFile, collections])
}
