export interface JwtInfo {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  /** Fechas del token en ms desde epoch (si el claim existe) */
  expiresAt?: number
  issuedAt?: number
  notBefore?: number
}

/** Decodifica un segmento base64url (UTF-8) a un objeto JSON. null si no lo es */
function decodePart(part: string): Record<string, unknown> | null {
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return json && typeof json === 'object' && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const toMs = (seconds: unknown): number | undefined =>
  typeof seconds === 'number' && Number.isFinite(seconds) ? seconds * 1000 : undefined

/**
 * Lee un JWT (acepta el prefijo "Bearer "). No verifica la firma: solo muestra lo que dice el token.
 * Devuelve null si el texto no tiene forma de JWT.
 */
export function decodeJwt(token: string): JwtInfo | null {
  const parts = token
    .trim()
    .replace(/^Bearer\s+/i, '')
    .split('.')
  if (parts.length !== 3) return null

  const header = decodePart(parts[0])
  const payload = decodePart(parts[1])
  if (!header || !payload) return null

  return {
    header,
    payload,
    expiresAt: toMs(payload.exp),
    issuedAt: toMs(payload.iat),
    notBefore: toMs(payload.nbf)
  }
}

const span = (ms: number): string => {
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`
  if (ms < 60_000) return plural(Math.round(ms / 1000), 'segundo', 'segundos')
  if (ms < 3_600_000) return plural(Math.round(ms / 60_000), 'minuto', 'minutos')
  if (ms < 86_400_000) return plural(Math.round(ms / 3_600_000), 'hora', 'horas')
  return plural(Math.round(ms / 86_400_000), 'día', 'días')
}

/** "Expira en 2 horas" / "Expiró hace 3 días" */
export function describeExpiry(
  expiresAt: number,
  now = Date.now()
): { expired: boolean; label: string } {
  const diff = expiresAt - now
  return diff <= 0
    ? { expired: true, label: `Expiró hace ${span(-diff)}` }
    : { expired: false, label: `Expira en ${span(diff)}` }
}
