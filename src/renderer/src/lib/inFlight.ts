/** Qué petición está en curso en cada pestaña, para poder cancelarla */
const requestIds = new Map<string, string>()
const cancelledTabs = new Set<string>()
const cancelledRequests = new Set<string>()

/** Registra una petición nueva para la pestaña y devuelve su id */
export function startInFlight(tabId: string): string {
  const requestId = crypto.randomUUID()
  requestIds.set(tabId, requestId)
  cancelledTabs.delete(tabId)
  return requestId
}

/** Cierra el seguimiento. Devuelve true si el usuario la había cancelado */
export function finishInFlight(tabId: string): boolean {
  const requestId = requestIds.get(tabId)
  if (requestId) cancelledRequests.delete(requestId)
  requestIds.delete(tabId)
  return cancelledTabs.delete(tabId)
}

export function cancelInFlight(tabId: string): void {
  const requestId = requestIds.get(tabId)
  if (!requestId) return
  cancelledTabs.add(tabId)
  cancelledRequests.add(requestId)
  void window.api.cancelRequest(requestId)
}

/** ¿El usuario canceló esta petición? (sirve para frenar los reintentos) */
export function isCancelled(requestId: string): boolean {
  return cancelledRequests.has(requestId)
}

/** Pestaña dueña de una petición en curso (para dirigirle los eventos en vivo) */
export function tabForRequest(requestId: string): string | undefined {
  for (const [tabId, id] of requestIds) if (id === requestId) return tabId
  return undefined
}
