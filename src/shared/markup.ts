/** Por encima de este tamaño no se da formato: sería lento y nadie lee un XML de varios MB */
export const MAX_FORMAT_CHARS = 2_000_000

/** ¿La respuesta es XML? (application/xml, text/xml, +xml como SOAP, Atom o SVG) */
export function isXmlResponse(contentType: string | undefined, body: string): boolean {
  if ((contentType ?? '').toLowerCase().includes('xml')) return true
  return /^\s*<\?xml[\s?]/i.test(body)
}

/** ¿La respuesta es una página HTML? Si no hay Content-Type útil, mira cómo empieza el body */
export function isHtmlResponse(contentType: string | undefined, body: string): boolean {
  const ct = (contentType ?? '').toLowerCase()
  if (ct.includes('html')) return true
  if (ct && !ct.startsWith('text/plain') && !ct.includes('octet-stream')) return false
  return /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(body)
}

// Un token por vez, en este orden: comentario, CDATA, instrucción (<?xml ?>), DOCTYPE, etiqueta, texto
const TOKEN = new RegExp(
  [
    '<!--[\\s\\S]*?-->',
    '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>',
    '<\\?[\\s\\S]*?\\?>',
    '<![A-Za-z](?:[^>\\[]|\\[[\\s\\S]*?\\])*>',
    '<\\/?[A-Za-z_:][^\\s<>\\/=]*(?:"[^"]*"|\'[^\']*\'|[^<>"\'])*>',
    '[^<]+'
  ].join('|'),
  'y'
)

type Kind = 'comment' | 'declaration' | 'open' | 'close' | 'selfClose' | 'text'
interface Token {
  kind: Kind
  raw: string
  name?: string
}

function tokenize(xml: string): Token[] | null {
  const tokens: Token[] = []
  TOKEN.lastIndex = 0
  while (TOKEN.lastIndex < xml.length) {
    const start = TOKEN.lastIndex
    const match = TOKEN.exec(xml)
    // Un "<" que no abre nada válido: no es XML bien formado
    if (!match || match.index !== start) return null

    const raw = match[0]
    if (raw.startsWith('<!--')) tokens.push({ kind: 'comment', raw })
    else if (raw.startsWith('<![CDATA[')) tokens.push({ kind: 'text', raw })
    else if (raw.startsWith('<?') || raw.startsWith('<!')) tokens.push({ kind: 'declaration', raw })
    else if (raw.startsWith('</')) {
      tokens.push({ kind: 'close', raw, name: /^<\/([^\s>]+)/.exec(raw)?.[1] })
    } else if (raw.startsWith('<')) {
      const name = /^<([^\s/>]+)/.exec(raw)?.[1]
      tokens.push({ kind: raw.endsWith('/>') ? 'selfClose' : 'open', raw, name })
    } else {
      const text = raw.trim()
      if (text) tokens.push({ kind: 'text', raw: text })
    }
  }
  return tokens
}

/**
 * Reindenta un XML para leerlo. Devuelve null si no está bien formado (etiquetas sin cerrar o
 * cruzadas, texto suelto...), para que quien llama muestre el original tal cual.
 * Los elementos con solo texto quedan en una línea: <id>5</id>.
 */
export function formatXml(xml: string, indent = '  '): string | null {
  if (xml.length > MAX_FORMAT_CHARS) return null
  const tokens = tokenize(xml.replace(/^\uFEFF/, ''))
  if (!tokens || !tokens.some((t) => t.kind === 'open' || t.kind === 'selfClose')) return null

  const lines: string[] = []
  const stack: string[] = []
  const pad = (): string => indent.repeat(stack.length)

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]

    if (t.kind === 'open') {
      const next = tokens[i + 1]
      const afterNext = tokens[i + 2]
      // <a>texto</a> y <a></a> se quedan en una sola línea
      if (next?.kind === 'text' && afterNext?.kind === 'close' && afterNext.name === t.name) {
        lines.push(`${pad()}${t.raw}${next.raw}${afterNext.raw}`)
        i += 2
        continue
      }
      if (next?.kind === 'close' && next.name === t.name) {
        lines.push(`${pad()}${t.raw}${next.raw}`)
        i += 1
        continue
      }
      lines.push(pad() + t.raw)
      stack.push(t.name ?? '')
    } else if (t.kind === 'close') {
      if (stack.pop() !== t.name) return null
      lines.push(pad() + t.raw)
    } else {
      // Texto, comentarios, declaraciones y etiquetas autocerradas
      if (t.kind === 'text' && stack.length === 0) return null
      lines.push(pad() + t.raw)
    }
  }

  return stack.length === 0 ? lines.join('\n') : null
}
