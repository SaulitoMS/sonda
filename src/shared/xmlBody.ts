import { looksLikeXml } from './bodyType'

interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref.startsWith('#x')) return String.fromCodePoint(parseInt(ref.slice(2), 16))
    if (ref.startsWith('#')) return String.fromCodePoint(Number(ref.slice(1)))
    return ENTITIES[ref] ?? whole
  })
}

/** Quita el prefijo de namespace: "soap:Body" → "Body" */
const localName = (name: string): string => name.slice(name.indexOf(':') + 1)

// CDATA | comentario | instrucción <? ?> | DOCTYPE | cierre | apertura (con atributos) | texto
const TOKEN =
  /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function buildTree(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]

  for (const m of xml.matchAll(TOKEN)) {
    const top = stack[stack.length - 1]
    if (m[1] !== undefined) {
      top.text += m[1]
    } else if (m[2] !== undefined) {
      if (stack.length === 1 || localName(top.name) !== localName(m[2])) {
        throw new Error(`XML inválido: la etiqueta </${m[2]}> no coincide`)
      }
      stack.pop()
    } else if (m[3] !== undefined) {
      const node: XmlNode = { name: m[3], attrs: {}, children: [], text: '' }
      for (const a of m[4].matchAll(ATTR)) {
        // Las declaraciones xmlns solo agregan ruido a las rutas
        if (a[1] === 'xmlns' || a[1].startsWith('xmlns:')) continue
        node.attrs[a[1]] = decode(a[2] ?? a[3] ?? '')
      }
      top.children.push(node)
      if (m[5] !== '/') stack.push(node)
    } else if (m[6] !== undefined) {
      top.text += decode(m[6])
    }
  }

  if (stack.length !== 1) {
    throw new Error(`XML inválido: falta cerrar <${stack[stack.length - 1].name}>`)
  }
  if (root.children.length !== 1) throw new Error('XML inválido: debe tener un único elemento raíz')
  return root
}

function toValue(node: XmlNode): unknown {
  const text = node.text.trim()
  const attrNames = Object.keys(node.attrs)
  if (attrNames.length === 0 && node.children.length === 0) return text

  const out = Object.create(null) as Record<string, unknown>
  for (const name of attrNames) out[`@${name}`] = node.attrs[name]
  for (const child of node.children) {
    const key = localName(child.name)
    const value = toValue(child)
    const prev = out[key]
    if (prev === undefined) out[key] = value
    else if (Array.isArray(prev)) prev.push(value)
    else out[key] = [prev, value]
  }
  if (text !== '') out['#text'] = text
  return out
}

/**
 * Convierte un XML en un objeto para poder usar las mismas rutas que en JSON:
 * sin namespaces (soap:Body → Body), atributos como "@id", texto mezclado como "#text"
 * y elementos repetidos como arreglo. Los valores siempre son texto.
 * Lanza un Error si el XML está mal formado.
 */
export function parseXml(xml: string): unknown {
  const root = buildTree(xml).children[0]
  const wrapper = Object.create(null) as Record<string, unknown>
  wrapper[localName(root.name)] = toValue(root)
  return wrapper
}

export type ParsedBody = { ok: true; value: unknown } | { ok: false }

/** Intenta leer el body como JSON y, si no lo es pero parece XML, como XML */
export function parseJsonOrXml(body: string): ParsedBody {
  try {
    return { ok: true, value: JSON.parse(body) }
  } catch {
    // no es JSON: se prueba XML
  }
  if (looksLikeXml(body)) {
    try {
      return { ok: true, value: parseXml(body) }
    } catch {
      // XML mal formado
    }
  }
  return { ok: false }
}
