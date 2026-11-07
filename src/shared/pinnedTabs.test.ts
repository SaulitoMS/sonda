import { describe, expect, it } from 'vitest'
import { SESSION_VERSION, parseSession } from './session'
import { keepAfterCloseRight, togglePinned } from './tabs'

const ids = (tabs: { id: string; pinned?: boolean }[]): string =>
  tabs.map((t) => t.id + (t.pinned ? '*' : '')).join(' ')

describe('togglePinned', () => {
  it('manda las ancladas a la izquierda sin alterar el orden del resto', () => {
    const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c', pinned: true }, { id: 'd' }]
    const pinned = togglePinned(tabs, 'd')
    expect(ids(pinned)).toBe('c* d* a b')
    expect(ids(togglePinned(pinned, 'c'))).toBe('d* c a b')
  })
})

describe('parseSession y pestañas ancladas', () => {
  const request = { method: 'GET', url: '/a', body: '', baseline: '', headers: [] }

  it('conserva solo las ancladas de verdad', () => {
    const raw = JSON.stringify({
      version: SESSION_VERSION,
      activeId: 'a',
      tabs: [
        { id: 'a', pinned: true, request },
        { id: 'b', pinned: 'si', request },
        { id: 'c', request }
      ]
    })
    expect(parseSession(raw)?.tabs.map((t) => t.pinned)).toEqual([true, undefined, undefined])
  })
})

describe('keepAfterCloseRight', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c', pinned: true }, { id: 'd' }, { id: 'e' }]

  it('conserva las de la izquierda, la elegida y las ancladas', () => {
    expect(keepAfterCloseRight(tabs, 'b').map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('si no hay nada que cerrar devuelve las mismas pestañas', () => {
    expect(keepAfterCloseRight(tabs, 'e')).toHaveLength(5)
    expect(keepAfterCloseRight(tabs, 'zzz')).toBe(tabs)
  })
})
