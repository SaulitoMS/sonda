/** Campos cuyo nombre sugiere que el número es una fecha */
const DATE_KEY =
  /(^|_|-)(at|date|time|timestamp|ts|exp|iat|nbf|expires|created|updated)(_|-|$)|(At|Date|Time|Timestamp|Expires)$/

/** Fecha legible si el número parece un timestamp Unix (segundos o ms) de un campo de fecha. Si no, null */
export function timestampHint(value: number, key: string | undefined): string | null {
  if (!key || !DATE_KEY.test(key)) return null
  if (!Number.isInteger(value) || value <= 0) return null

  // 10 dígitos = segundos, 13 dígitos = milisegundos
  const ms = value < 1e11 ? value * 1000 : value
  const date = new Date(ms)
  const year = date.getUTCFullYear()
  if (Number.isNaN(year) || year < 2000 || year > 2100) return null

  return date.toLocaleString()
}
