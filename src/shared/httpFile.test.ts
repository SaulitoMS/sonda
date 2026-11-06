import { describe, expect, it } from 'vitest'
import { isHttpFilePath, parseHttpFile } from './httpFile'

const sample = `@host = https://api.example.com
@token = abc123

### Login
# @name login
POST {{host}}/auth/login HTTP/1.1
Content-Type: application/json

{
  "user": "ana",
  "id": "{{$guid}}"
}

###
// Lista de usuarios
GET {{host}}/users
  ?page=1
  &limit=20
Authorization: Bearer {{token}}

### Sin método
{{host}}/health

### Raro
GRAPHQL {{host}}/graphql
`

describe('parseHttpFile', () => {
  const parsed = parseHttpFile(sample, 'api.http')

  it('usa el nombre del archivo y pasa las variables de archivo', () => {
    expect(parsed.name).toBe('HTTP api')
    expect(parsed.variables).toEqual([
      { key: 'host', value: 'https://api.example.com' },
      { key: 'token', value: 'abc123' }
    ])
  })

  it('separa las peticiones por ### y toma el nombre', () => {
    expect(parsed.requests.map((r) => r.request.name)).toEqual([
      'Login',
      'GET /users',
      'Sin método'
    ])
  })

  it('lee método, headers y body, y traduce {{$guid}}', () => {
    const login = parsed.requests[0].request
    expect(login.method).toBe('POST')
    expect(login.url).toBe('{{host}}/auth/login')
    expect(login.headers).toEqual([
      { key: 'Content-Type', value: 'application/json', enabled: true }
    ])
    expect(login.body).toContain('"user": "ana"')
    expect(login.body).toContain('{{$uuid}}')
  })

  it('une la query en varias líneas y conserva comentarios como descripción', () => {
    const users = parsed.requests[1].request
    expect(users.url).toBe('{{host}}/users?page=1&limit=20')
    expect(users.description).toBe('Lista de usuarios')
  })

  it('asume GET si solo hay URL y avisa de métodos no soportados', () => {
    expect(parsed.requests[2].request.method).toBe('GET')
    expect(parsed.warnings.join(' ')).toContain('GRAPHQL')
  })

  it('falla si no hay peticiones', () => {
    expect(() => parseHttpFile('# solo comentarios', 'x.http')).toThrow()
  })

  it('reconoce la extensión', () => {
    expect(isHttpFilePath('a/b/api.HTTP')).toBe(true)
    expect(isHttpFilePath('api.json')).toBe(false)
  })
})

describe('parseHttpFile: avisos', () => {
  it('avisa de variables dinámicas sin equivalente, referencias a respuestas y archivos externos', () => {
    const text = [
      'POST https://x.io/a',
      'Authorization: Bearer {{login.response.body.$.token}}',
      '',
      '< ./body.json',
      '',
      '###',
      'GET https://x.io/b?r={{$randomInt 1 5}}'
    ].join('\n')
    const { requests, warnings } = parseHttpFile(text, 'x.rest')
    expect(requests).toHaveLength(2)
    expect(requests[0].request.body).toBe('')
    const all = warnings.join(' ')
    expect(all).toContain('$randomInt')
    expect(all).toContain('Extraer')
    expect(all).toContain('archivo externo')
  })
})
