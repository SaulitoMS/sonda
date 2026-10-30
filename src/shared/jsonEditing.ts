export interface EditorState {
  value: string
  /** Inicio y fin de la selección (iguales si solo hay cursor) */
  start: number
  end: number
}

/** Reemplaza [from, to) por `insert` y deja la selección en [selStart, selEnd] del texto resultante */
export interface EditorEdit {
  from: number
  to: number
  insert: string
  selStart: number
  selEnd: number
}

const INDENT = '  '

const PAIRS = new Map([
  ['{', '}'],
  ['[', ']'],
  ['"', '"']
])

const caret = (from: number, to: number, insert: string, pos: number): EditorEdit => ({
  from,
  to,
  insert,
  selStart: pos,
  selEnd: pos
})

const lineStartOf = (value: string, pos: number): number =>
  pos === 0 ? 0 : value.lastIndexOf('\n', pos - 1) + 1

/** Solo se asiste cuando el texto es (o empieza a ser) un objeto o arreglo JSON */
function isJsonish(value: string): boolean {
  const first = value.trimStart()[0]
  return first === undefined || first === '{' || first === '['
}

/**
 * Decide qué cambio hacer cuando se presiona una tecla en el editor de JSON.
 * Devuelve null si la tecla debe comportarse con normalidad.
 */
export function editForKey(state: EditorState, key: string, shift = false): EditorEdit | null {
  const { value, start, end } = state
  if (!isJsonish(value)) return null

  const hasSelection = start !== end
  const prev: string | undefined = value[start - 1]
  const next: string | undefined = value[end]

  if (key === 'Enter') {
    const lineStart = lineStartOf(value, start)
    const indent = value.slice(lineStart, start).match(/^[ \t]*/)?.[0] ?? ''
    const opens = prev === '{' || prev === '['

    // {|} → el cierre baja a su propia línea y el cursor queda en medio, con un nivel más
    if (opens && next === PAIRS.get(prev)) {
      const insert = `\n${indent}${INDENT}\n${indent}`
      return caret(start, end, insert, start + 1 + indent.length + INDENT.length)
    }

    const insert = `\n${opens ? indent + INDENT : indent}`
    return caret(start, end, insert, start + insert.length)
  }

  const closer = PAIRS.get(key)
  if (closer !== undefined) {
    if (hasSelection) {
      const selected = value.slice(start, end)
      return {
        from: start,
        to: end,
        insert: key + selected + closer,
        selStart: start + 1,
        selEnd: end + 1
      }
    }
    if (key === '"') {
      // Si ya hay una comilla de cierre delante, se salta en vez de duplicarla
      if (next === '"') return caret(start, start, '', start + 1)
      // Después de una letra o de \ la comilla es parte del texto (5" o \")
      if (prev !== undefined && /[\w\\]/.test(prev)) return null
    }
    // No se cierra pegado a una palabra que ya existe
    if (next !== undefined && /[\w"{[]/.test(next)) return null
    return caret(start, end, key + closer, start + 1)
  }

  if ((key === '}' || key === ']') && !hasSelection) {
    if (next === key) return caret(start, start, '', start + 1)

    // Un cierre en una línea que solo tiene sangría retrocede un nivel
    const before = value.slice(lineStartOf(value, start), start)
    if (before !== '' && /^[ \t]*$/.test(before) && before.endsWith(INDENT)) {
      const from = start - INDENT.length
      return caret(from, end, key, from + 1)
    }
    return null
  }

  if (key === 'Backspace' && !hasSelection) {
    const open = prev
    const close = open !== undefined ? PAIRS.get(open) : undefined
    if (close !== undefined && close === next) return caret(start - 1, start + 1, '', start - 1)
    return null
  }

  if (key === 'Tab') {
    if (!shift) return caret(start, end, INDENT, start + INDENT.length)

    const lineStart = lineStartOf(value, start)
    const spaces = /^ {1,2}/.exec(value.slice(lineStart))?.[0].length ?? 0
    if (spaces === 0) return null
    return caret(lineStart, lineStart + spaces, '', Math.max(lineStart, start - spaces))
  }

  return null
}
