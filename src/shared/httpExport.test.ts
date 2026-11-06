import { describe, expect, it } from 'vitest'
import { buildHttpFile } from './httpExport'
import { parseHttpFile } from './httpFile'
import type { ExportFile } from './postmanExport'
import type { KeyValueData } from './types'

const header = (key: string, value: string, enabled = true): KeyValueData => ({
  key,
  value,
  enabled
})

const files: ExportFile[] = [
  {
    path: 'users/create.json',
    request: {
      name: 'Crear usuario',
      method: 'POST',
      url: '{{baseUrl}}/users',
      headers: [header('Accept', 'application/json'), header('X-Off', '1', false)],
      body: '{"a":1}',
      description: 'Crea un usuario'
    }
  },
  {
    path: 'login.json',
    request: {
      name: 'Login',
      method: 'POST',
      url: '{{baseUrl}}/login',
      headers: [],
      body: '',
      bodyForm: {
        mode: 'urlencoded',
        fields: [{ key: 'user', value: 'a b', type: 'text', enabled: true }]
      }
    }
  }
]

describe('buildHttpFile', () => {
  const text = buildHttpFile('Mi API', 'https://api.x.io', files)

  it('declara la baseUrl como variable de archivo', () => {
    expect(text).toContain('@baseUrl = https://api.x.io')
  })

  it('omite los headers desactivados y deja el body tras una línea en blanco', () => {
    expect(text).not.toContain('X-Off')
    expect(text).toContain('POST {{baseUrl}}/users\nAccept: application/json\n\n{"a":1}')
  })

  it('codifica urlencoded y agrega su Content-Type', () => {
    expect(text).toContain('Content-Type: application/x-www-form-urlencoded\n\nuser=a%20b')
  })

  it('se puede volver a importar sin perder peticiones', () => {
    const parsed = parseHttpFile(text, 'mi-api.http')
    expect(parsed.variables).toEqual([{ key: 'baseUrl', value: 'https://api.x.io' }])
    expect(parsed.requests.map((r) => r.request.name)).toEqual(['Crear usuario', 'Login'])
    expect(parsed.requests[0].request.body).toBe('{"a":1}')
    expect(parsed.requests[1].request.body).toBe('user=a%20b')
  })
})
