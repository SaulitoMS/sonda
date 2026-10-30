/** Qué petición está en curso en cada pestaña, para poder cancelarla */
const requestIds = new Map<string, string>()
const cancelledTabs = new Set<string>()

/** Registra una petición nueva para la pestaña y devuelve su id */
export function startInFlight(tabId: string): string {
  const requestId = crypto.randomUUID()
  requestIds.set(tabId, requestId)
  cancelledTabs.delete(tabId)
  return requestId
}

/** Cierra el seguimiento. Devuelve true si el usuario la había cancelado */
export function finishInFlight(tabId: string): boolean {
  requestIds.delete(tabId)
  return cancelledTabs.delete(tabId)
}

export function cancelInFlight(tabId: string): void {
  const requestId = requestIds.get(tabId)
  if (!requestId) return
  cancelledTabs.add(tabId)
  void window.api.cancelRequest(requestId)
}