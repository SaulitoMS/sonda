/** Clave de una carpeta dentro de una vuelta de datos: cada fila de datos lleva su propia cuenta */
const folderKey = (group: string, iteration?: number): string => `${iteration ?? 0}|${group}`

export interface FolderSkipper {
  /** ¿Se debe saltar esta petición porque otra de su carpeta ya falló? */
  shouldSkip: (group: string, iteration?: number) => boolean
  /** Anota que una petición de la carpeta falló */
  markFailed: (group: string, iteration?: number) => void
}

/**
 * Lleva la cuenta de las carpetas con fallos para saltar el resto de sus peticiones.
 * Las peticiones sin carpeta (group "") nunca se saltan: no dependen unas de otras.
 */
export function createFolderSkipper(enabled: boolean): FolderSkipper {
  const failed = new Set<string>()
  return {
    shouldSkip: (group, iteration) =>
      enabled && group !== '' && failed.has(folderKey(group, iteration)),
    markFailed: (group, iteration) => {
      if (enabled && group !== '') failed.add(folderKey(group, iteration))
    }
  }
}

/**
 * ¿Se reintenta una petición que ya respondió? Por defecto solo los fallos pasajeros
 * (red, 429, 5xx); con `retryAny` cualquier fallo, que sirve para esperar a que algo se complete.
 */
export const shouldRetryRow = (status: string, transient: boolean, retryAny: boolean): boolean =>
  status === 'fail' && (retryAny || transient)
