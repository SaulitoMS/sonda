import { describe, expect, it } from 'vitest'
import { emptyAuth } from './auth'
import { parseInsomnia, looksLikeInsomnia } from './insomnia'
import { buildInsomniaExport } from './insomniaExport'
import type { ExportFile } from './postmanExport'
import type { KeyValueData, SavedRequest } from './types'

const header = (key: string, value: string, enabled = true): KeyValueData => ({
  key,
  value,
  enabled
})

const request = (patch: Partial<SavedRequest>): SavedRequest => ({
  name: 'Petición',
  method: 'GET',
  url: '{{baseUrl}}/x',
  headers: [],
  body: '',
  ...patch
})

const files: ExportFile[] = [
  {
    path: 'users/get-user.json',
    request: request({
      name: 'Get user',
      url: '{{baseUrl}}/users/1?x={{id}}',
      headers: [header('Accept', 'application/json'), header('X-Off', 'v', false)],
      auth: { ...emptyAuth(), type: 'bearer', token: '{{token}}' },
      description: 'Trae un usuario'
    })
  },
  {
    path: 'users/create.json',
    request: request({
      name: 'Create',
      method: 'POST',
      body: '{"a":1,"id":"{{$uuid}}"}'
    })
  },
  {
    path: 'login.json',
    request: request({
      name: 'Login',
      method: 'POST',
      bodyForm: {
        mode: 'urlencoded',
        fields: [{ key: 'u', value: '{{user}}', type: 'text', enabled: true }]
      }
    })
  },
  {
    path: 'upload.json',
    request: request({
      name: 'Upload',
      method: 'POST',
      bodyForm: {
        mode: 'form-data',
        fields: [
          { key: 'f', value: '/tmp/a.png', type: 'file', enabled: true },
          { key: 'n', value: 'x', type: 'text', enabled: true }
        ]
      }
    })
  },
  {
    path: 'xml.json',
    request: request({
      name: 'Xml',
      method: 'POST',
      headers: [header('Content-Type', 'text/xml; charset=utf-8')],
      body: '<a/>'
    })
  }
]

interface Resource {
  _id: string
  name?: string
  url?: string
  body?: { mimeType?: string; text?: string; params?: Record<string, unknown>[] }
  authentication?: Record<string, unknown>
}

interface Built {
  __export_date: string
  resources: Resource[]
}

const build = (): Built =>
  buildInsomniaExport(
    'Mi API',
    'https://api.test',
    files,
    new Date('2026-01-02T03:04:05Z')
  ) as unknown as Built

describe('buildInsomniaExport', () => {
  it('genera un export v4 reconocible, con ids únicos y fecha fija', () => {
    const out = build()
    expect(looksLikeInsomnia(out)).toBe(true)
    expect(out.__export_date).toBe('2026-01-02T03:04:05.000Z')
    const ids = out.resources.map((r) => r._id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('convierte variables y deja las dinámicas intactas', () => {
    const { resources } = build()
    expect(resources.find((r) => r.name === 'Get user')?.url).toBe(
      '{{ _.baseUrl }}/users/1?x={{ _.id }}'
    )
    expect(resources.find((r) => r.name === 'Create')?.body?.text).toBe('{"a":1,"id":"{{$uuid}}"}')
  })

  it('deduce el mimeType del body y exporta la auth y los archivos', () => {
    const { resources } = build()
    const byName = (n: string): Resource => resources.find((r) => r.name === n)!
    expect(byName('Create').body?.mimeType).toBe('application/json')
    expect(byName('Xml').body?.mimeType).toBe('text/xml')
    expect(byName('Get user').authentication).toEqual({
      type: 'bearer',
      token: '{{ _.token }}',
      prefix: ''
    })
    expect(byName('Upload').body?.params?.[0]).toEqual({
      name: 'f',
      type: 'file',
      value: '',
      fileName: '/tmp/a.png'
    })
  })

  it('al volver a importarlo con parseInsomnia no pierde información', () => {
    const back = parseInsomnia(JSON.parse(JSON.stringify(build())))
    expect(back.name).toBe('Mi API')
    expect(back.variables).toEqual([{ key: 'baseUrl', value: 'https://api.test' }])

    const get = back.requests.find((r) => r.request.name === 'Get user')!
    expect(get.folder).toBe('users')
    expect(get.request.url).toBe('{{baseUrl}}/users/1?x={{id}}')
    expect(get.request.auth?.token).toBe('{{token}}')
    expect(get.request.description).toBe('Trae un usuario')
    expect(get.request.headers.map((h) => [h.key, h.enabled])).toEqual([
      ['Accept', true],
      ['X-Off', false]
    ])

    const login = back.requests.find((r) => r.request.name === 'Login')!
    expect(login.folder).toBe('')
    expect(login.request.bodyForm?.mode).toBe('urlencoded')
    expect(login.request.bodyForm?.fields[0].value).toBe('{{user}}')

    const upload = back.requests.find((r) => r.request.name === 'Upload')!
    expect(upload.request.bodyForm?.fields[0]).toMatchObject({ type: 'file', value: '/tmp/a.png' })
  })
})
