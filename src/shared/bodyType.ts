/** ¿El texto parece XML? Declaración <?xml o un documento que abre y cierra con etiquetas (HTML no cuenta) */
export function looksLikeXml(text: string): boolean {
  const t = text.trim()
  if (t.startsWith('<?xml')) return true
  if (/^<html[\s>]/i.test(t)) return false
  return /^<[A-Za-z_][\w:.-]*[\s>/][\s\S]*>$/.test(t)
}
