/** Texto corto para la pestaña: el nombre guardado o la ruta de la URL */
export function tabLabel(input: { name: string; url: string }): string {
  if (input.name.trim()) return input.name.trim()
  const url = input.url.trim()
  if (!url) return 'Nueva petición'
  const path = url
    .replace(/^\{\{[^}]*\}\}/, '') // {{baseUrl}}
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i, '') // https://host
  return path || url
}

/**
 * Qué pestaña queda activa al cerrar `closedId`.
 * - Si se cierra una inactiva, no cambia nada.
 * - Si se cierra la activa, queda la que ocupa su lugar (o la anterior si era la última).
 * - null si no queda ninguna.
 */
export function nextActiveAfterClose(
  ids: string[],
  closedId: string,
  activeId: string
): string | null {
  if (closedId !== activeId) return activeId
  const index = ids.indexOf(closedId)
  const remaining = ids.filter((id) => id !== closedId)
  if (remaining.length === 0) return null
  return remaining[Math.min(Math.max(index, 0), remaining.length - 1)]
}

/** Alterna el anclaje de `id` y deja las ancladas a la izquierda, sin alterar el orden del resto */
export function togglePinned<T extends { id: string; pinned?: boolean }>(
  tabs: T[],
  id: string
): T[] {
  const next = tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t))
  return [...next.filter((t) => t.pinned), ...next.filter((t) => !t.pinned)]
}

/** Pestañas que quedan al cerrar las de la derecha de `id`: las de su izquierda, ella misma y las ancladas */
export function keepAfterCloseRight<T extends { id: string; pinned?: boolean }>(
  tabs: T[],
  id: string
): T[] {
  const index = tabs.findIndex((t) => t.id === id)
  if (index === -1) return tabs
  return tabs.filter((t, i) => i <= index || t.pinned)
}
