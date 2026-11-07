export const MAX_DESCRIPTION = 20_000

/** Limpia la descripción de una colección: texto sin espacios de más y con tope. Vacía → null */
export function cleanDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\r\n/g, '\n').trim()
  return text ? text.slice(0, MAX_DESCRIPTION) : null
}

/** Resumen para un tooltip: recorta la descripción y agrega "…" si era más larga. Sin texto → "" */
export function previewDescription(text: string | undefined, max = 160): string {
  const clean = text?.trim() ?? ''
  return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean
}
