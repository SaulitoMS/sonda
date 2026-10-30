import { describe, expect, it } from 'vitest'
import { editForKey } from './jsonEditing'

/** Aplica la tecla a un texto con el cursor marcado con | y devuelve el resultado con el cursor */
function apply(text: string, key: string, shift = false): string | null {
  const at = text.indexOf('|')
  const value = text.replace('|', '')
  const edit = editForKey({ value, start: at, end: at }, key, shift)
  if (!edit) return null
  const result = value.slice(0, edit.from) + edit.insert + value.slice(edit.to)
  return result.slice(0, edit.selStart) + '|' + result.slice(edit.selStart)
}

describe('Enter', () => {
  it('entra un nivel después de {', () => {
    expect(apply('{|', 'Enter')).toBe('{\n  |')
  })

  it('entre {} deja el cierre en su propia línea', () => {
    expect(apply('{|}', 'Enter')).toBe('{\n  |\n}')
  })

  it('respeta la sangría del padre en objetos anidados', () => {
    expect(apply('{\n  "a": {|}\n}', 'Enter')).toBe('{\n  "a": {\n    |\n  }\n}')
  })

  it('mantiene la sangría después de una coma', () => {
    expect(apply('{\n  "a": 1,|\n}', 'Enter')).toBe('{\n  "a": 1,\n  |\n}')
  })
})

describe('cierre automático', () => {
  it('cierra llaves y corchetes', () => {
    expect(apply('|', '{')).toBe('{|}')
    expect(apply('[|]', '{')).toBe('[{|}]')
  })

  it('cierra comillas', () => {
    expect(apply('{|}', '"')).toBe('{"|"}')
  })

  it('no cierra pegado a una palabra existente', () => {
    expect(apply('[|x]', '{')).toBeNull()
  })

  it('escribir {{ deja {{|}} para las variables', () => {
    expect(apply('{|}', '{')).toBe('{{|}}')
  })

  it('envuelve la selección', () => {
    const edit = editForKey({ value: '[x]', start: 1, end: 2 }, '"')
    expect(edit).toEqual({ from: 1, to: 2, insert: '"x"', selStart: 2, selEnd: 3 })
  })
})

describe('saltar el cierre', () => {
  it('salta la comilla de cierre', () => {
    expect(apply('{"a|"}', '"')).toBe('{"a"|}')
  })

  it('salta } si ya está delante', () => {
    expect(apply('{"a": 1|}', '}')).toBe('{"a": 1}|')
  })

  it('un } en una línea con sangría retrocede un nivel', () => {
    expect(apply('{\n  |', '}')).toBe('{\n}|')
  })

  it('un } normal no se toca', () => {
    expect(apply('{"a": 1|', '}')).toBeNull()
  })
})

describe('Backspace', () => {
  it('borra el par vacío completo', () => {
    expect(apply('{|}', 'Backspace')).toBe('|')
    expect(apply('{"|"}', 'Backspace')).toBe('{|}')
  })

  it('no hace nada especial si el par tiene contenido', () => {
    expect(apply('{a|}', 'Backspace')).toBeNull()
  })
})

describe('Tab', () => {
  it('inserta dos espacios', () => {
    expect(apply('{\n|', 'Tab')).toBe('{\n  |')
  })

  it('Shift+Tab quita la sangría', () => {
    expect(apply('{\n    |"a"', 'Tab', true)).toBe('{\n  |"a"')
  })

  it('Shift+Tab sin sangría deja el comportamiento normal', () => {
    expect(apply('{\n|"a"', 'Tab', true)).toBeNull()
  })
})

describe('texto que no es JSON', () => {
  it('no interviene', () => {
    expect(apply('hola|', '{')).toBeNull()
    expect(apply('<a>|', 'Enter')).toBeNull()
  })
})
