import { describe, expect, it } from 'vitest'
import type { CurlRequest } from './curl'
import { generateCode } from './codegen'

const post: CurlRequest = {
  method: 'POST',
  url: 'https://api.ejemplo.com/users',
  headers: [{ key: 'Content-Type', value: 'application/json' }],
  body: '{"name":"Sonda","note":"línea\\n\\"dos\\""}'
}

describe('generateCode', () => {
  it('curl delega en toCurl', () => {
    expect(generateCode('curl', post)).toContain('--request POST')
  })

  it('fetch incluye método, headers y body', () => {
    const code = generateCode('fetch', post)
    expect(code).toContain('await fetch("https://api.ejemplo.com/users"')
    expect(code).toContain('method: "POST"')
    expect(code).toContain('"Content-Type": "application/json"')
    expect(code).toContain('body: ')
  })

  it('fetch omite el body en GET', () => {
    const code = generateCode('fetch', { ...post, method: 'GET' })
    expect(code).not.toContain('body:')
  })

  it('fetch usa btoa para Basic', () => {
    const code = generateCode('fetch', { ...post, user: 'ana:{{pass}}' })
    expect(code).toContain('btoa("ana:{{pass}}")')
  })

  it('axios usa auth separando solo en el primer ":"', () => {
    const code = generateCode('axios', { ...post, user: 'ana:a:b' })
    expect(code).toContain('auth: { username: "ana", password: "a:b" }')
    expect(code).toContain('method: "post"')
  })

  it('python genera requests.request con headers y auth', () => {
    const code = generateCode('python', { ...post, user: 'ana:123' })
    expect(code).toContain('requests.request(')
    expect(code).toContain('auth=("ana", "123")')
    expect(code).toContain('.encode("utf-8")')
  })

  it('el body queda como literal fiel (sin reformatear JSON)', () => {
    const code = generateCode('fetch', post)
    expect(code).toContain(`body: ${JSON.stringify(post.body)}`)
  })
})
