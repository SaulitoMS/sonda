import { describe, expect, it } from 'vitest'
import { MAX_TABS, parseSession, type PersistedRequest, type PersistedSession } from './session'

const request = (over: Partial<PersistedRequest> = {}): PersistedRequest => ({
  method: 'GET',
  url: 'https://x.com',
  headers: [{ id: 'h1', key: 'A', value: '1', enabled: true }],
  body: '',
  auth: null,
  assertions: [],
  extractions: [],
  requestSchema: null,
  responseSchemas: null,
  currentFile: null,
  name: '',
  baseline: '{}',
  ...over
})

const session = (over: Partial<PersistedSession> = {}): PersistedSession => ({
  version: 1,
  activeId: 'b',
  tabs: [
    { id: 'a', request: request() },
    { id: 'b', request: request({ url: 'https://y.com' }) }
  ],
  ...over
})

describe('parseSession', () => {
  it('recupera una sesión válida', () => {
    expect(parseSession(JSON.stringify(session()))).toEqual(session())
  })

  it('tolera null, JSON roto, otra versión y formas inesperadas', () => {
    expect(parseSession(null)).toBeNull()
    expect(parseSession('{no es json')).toBeNull()
    expect(parseSession('null')).toBeNull()
    expect(parseSession(JSON.stringify({ ...session(), version: 99 }))).toBeNull()
    expect(parseSession(JSON.stringify({ version: 1, tabs: 'x' }))).toBeNull()
  })

  it('descarta pestañas inválidas y conserva las válidas', () => {
    const raw = JSON.stringify({
      ...session(),
      tabs: [{ id: 'a', request: request() }, { id: 'x', request: { method: 'NOPE' } }, null]
    })
    expect(parseSession(raw)?.tabs.map((t) => t.id)).toEqual(['a'])
  })

  it('devuelve null si no queda ninguna pestaña', () => {
    expect(parseSession(JSON.stringify({ ...session(), tabs: [] }))).toBeNull()
  })

  it('usa la primera pestaña si la activa ya no existe', () => {
    expect(parseSession(JSON.stringify(session({ activeId: 'zzz' })))?.activeId).toBe('a')
  })

  it('limita la cantidad de pestañas', () => {
    const tabs = Array.from({ length: MAX_TABS + 10 }, (_, i) => ({
      id: String(i),
      request: request()
    }))
    expect(parseSession(JSON.stringify(session({ tabs, activeId: '0' })))?.tabs).toHaveLength(
      MAX_TABS
    )
  })
})