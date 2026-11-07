import { describe, expect, it } from 'vitest'
import { lintCollection, lintRequest } from './collectionLint'
import type { SavedRequest } from './types'

const req = (o: Partial<SavedRequest> = {}): SavedRequest => ({
  name: 'x',
  method: 'GET',
  url: '{{baseUrl}}/a',
  headers: [],
  body: '',
  assertions: [{ id: '1' } as never],
  ...o
})

const ids = (r: SavedRequest): string[] => lintRequest(r).map((i) => i.id)

describe('lintRequest', () => {
  it('una petición correcta no tiene avisos', () => {
    expect(ids(req())).toEqual([])
  })

  it('detecta host fijo, pero no localhost', () => {
    expect(ids(req({ url: 'https://api.prod.com/x' }))).toContain('hardcoded-host')
    expect(ids(req({ url: 'http://localhost:3000/x' }))).not.toContain('hardcoded-host')
  })

  it('detecta GET con body y POST sin body', () => {
    expect(ids(req({ body: '{}' }))).toContain('get-with-body')
    expect(ids(req({ method: 'POST' }))).toContain('write-without-body')
    expect(ids(req({ method: 'POST', body: '{}' }))).not.toContain('write-without-body')
  })

  it('detecta headers activos repetidos sin distinguir mayúsculas', () => {
    const headers = [
      { key: 'Accept', value: 'a', enabled: true },
      { key: 'accept', value: 'b', enabled: true }
    ]
    expect(ids(req({ headers }))).toContain('duplicate-header')
    headers[1].enabled = false
    expect(ids(req({ headers }))).not.toContain('duplicate-header')
  })

  it('avisa si nada comprueba la respuesta', () => {
    expect(ids(req({ assertions: [] }))).toContain('no-checks')
    expect(ids(req({ assertions: [], responseSchemas: {} }))).not.toContain('no-checks')
  })
})

describe('lintCollection', () => {
  it('marca las duplicadas e ignora la barra final', () => {
    const out = lintCollection([
      { path: 'a', label: 'A', request: req() },
      { path: 'b', label: 'B', request: req({ url: '{{baseUrl}}/a/' }) },
      { path: 'c', label: 'C', request: req({ url: '{{baseUrl}}/otra' }) }
    ])
    expect(out.map((r) => r.label)).toEqual(['A', 'B'])
    expect(out[0].issues[0].id).toBe('duplicate-request')
  })
})
