export interface ConditionalHeader {
  key: 'If-None-Match' | 'If-Modified-Since'
  value: string
}

/** Header condicional para revalidar una respuesta. Prefiere ETag sobre Last-Modified. null si no hay validador */
export function conditionalHeader(headers: Record<string, string>): ConditionalHeader | null {
  const etag = headers['etag']?.trim()
  if (etag) return { key: 'If-None-Match', value: etag }
  const lastModified = headers['last-modified']?.trim()
  if (lastModified) return { key: 'If-Modified-Since', value: lastModified }
  return null
}

/** ¿Este header de petición ya es condicional? (para reemplazarlo en vez de duplicarlo) */
export const isConditionalKey = (key: string): boolean =>
  /^if-(none-match|modified-since)$/i.test(key.trim())
