import { describe, expect, it } from 'vitest'
import { SHORTCUT_GROUPS, formatKeys } from './shortcuts'

describe('formatKeys', () => {
  it('usa símbolos en Mac', () => {
    expect(formatKeys('Mod+Shift+T', true)).toBe('⌘⇧T')
    expect(formatKeys('Mod+Enter', true)).toBe('⌘↵')
    expect(formatKeys('Mod+Tab', true)).toBe('⌘⇥')
  })

  it('usa nombres en el resto de sistemas', () => {
    expect(formatKeys('Mod+Shift+T', false)).toBe('Ctrl+Shift+T')
    expect(formatKeys('Mod+Enter', false)).toBe('Ctrl+Enter')
  })

  it('deja intactas las teclas sueltas y especiales', () => {
    expect(formatKeys('Esc', true)).toBe('Esc')
    expect(formatKeys('Mod+\\', false)).toBe('Ctrl+\\')
    expect(formatKeys('Mod+1…8', true)).toBe('⌘1…8')
  })
})

describe('SHORTCUT_GROUPS', () => {
  it('no repite una misma acción con la misma combinación dentro de un grupo', () => {
    for (const group of SHORTCUT_GROUPS) {
      const seen = group.items.map((i) => `${i.keys}|${i.label}`)
      expect(new Set(seen).size).toBe(seen.length)
    }
  })

  it('todos los atajos tienen texto', () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const item of group.items) {
        expect(item.keys.trim()).not.toBe('')
        expect(item.label.trim()).not.toBe('')
      }
    }
  })
})
