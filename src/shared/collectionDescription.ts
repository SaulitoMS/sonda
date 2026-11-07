export const MAX_DESCRIPTION = 20_000

/** Limpia la descripción de una colección: texto sin espacios de más y con tope. Vacía → null */
export function cleanDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\r\n/g, '\n').trim()
  return text ? text.slice(0, MAX_DESCRIPTION) : null
}
