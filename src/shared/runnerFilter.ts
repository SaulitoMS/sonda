/** "login, Users" → ["login", "users"] */
export const splitTerms = (raw: string): string[] =>
  raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)

/**
 * ¿Entra la petición en la ejecución? Debe contener alguno de los términos de `include`
 * (si hay) y ninguno de los de `exclude`. Los términos se separan con coma.
 */
export function passesFilter(text: string, include: string, exclude: string): boolean {
  const hay = text.toLowerCase()
  if (splitTerms(exclude).some((t) => hay.includes(t))) return false
  const wanted = splitTerms(include)
  return wanted.length === 0 || wanted.some((t) => hay.includes(t))
}
