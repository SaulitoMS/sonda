/** Tope de coincidencias que se resaltan, para que una búsqueda como "a" no congele la UI */
export const MAX_MATCHES = 5000

const isContainer = (v: unknown): v is object => v !== null && typeof v === 'object'

/** Ruta en el formato que usan el filtro, las aserciones y las extracciones: data.items[0].name */
export const childPath = (parent: string, key: string, isArray: boolean): string =>
  isArray ? `${parent}[${key}]` : parent ? `${parent}.${key}` : key

/** Cuántas veces aparece `query` en `text` (sin distinguir mayúsculas), hasta `limit` */
export function countMatches(text: string, query: string, limit = MAX_MATCHES): number {
  if (!query) return 0
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let n = 0
  let i = t.indexOf(q)
  while (i !== -1 && n < limit) {
    n++
    i = t.indexOf(q, i + q.length)
  }
  return n
}

export interface TreeSearch {
  /** Total de coincidencias en todo el árbol */
  total: number
  /** Índice global de la primera coincidencia de cada texto: "ruta|k" (clave) o "ruta|v" (valor) */
  starts: Map<string, number>
  /** Rutas de los contenedores con coincidencias dentro: deben mostrarse abiertos */
  open: Set<string>
}

/** Posiciones (índice de carácter) donde empieza cada coincidencia de `query`, sin solaparse */
export function findAll(text: string, query: string, limit = MAX_MATCHES): number[] {
  const out: number[] = []
  if (!query) return out
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let i = t.indexOf(q)
  while (i !== -1 && out.length < limit) {
    out.push(i)
    i = t.indexOf(q, i + q.length)
  }
  return out
}

const primitiveText = (v: unknown): string => (typeof v === 'string' ? v : String(v))

/**
 * Recorre el JSON en el mismo orden en que lo dibuja JsonTree (clave y luego valor,
 * de arriba abajo), numerando las coincidencias para poder saltar de una a otra.
 * Los índices de arreglo ([0], [1]…) no se buscan: solo claves de objeto y valores.
 */
export function buildTreeSearch(root: unknown, query: string): TreeSearch {
  const starts = new Map<string, number>()
  const open = new Set<string>()
  let total = 0

  const add = (key: string, text: string): boolean => {
    if (total >= MAX_MATCHES) return false
    const c = countMatches(text, query)
    if (c === 0) return false
    starts.set(key, total)
    total += c
    return true
  }

  // Devuelve true si este nodo o algo dentro de él tiene coincidencias
  const walk = (value: unknown, path: string, label: string | undefined): boolean => {
    let found = label !== undefined && add(`${path}|k`, label)

    if (isContainer(value)) {
      const isArray = Array.isArray(value)
      const entries: [string, unknown][] = isArray
        ? value.map((v, i) => [String(i), v])
        : Object.entries(value)
      let inside = false
      for (const [k, v] of entries) {
        if (walk(v, childPath(path, k, isArray), isArray ? undefined : k)) inside = true
      }
      if (inside) {
        open.add(path)
        found = true
      }
    } else if (add(`${path}|v`, primitiveText(value))) {
      found = true
    }
    return found
  }

  walk(root, '', undefined)
  return { total, starts, open }
}