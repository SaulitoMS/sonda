import { describe, expect, it } from 'vitest'
import { hexPreview, parseHeaderLines, parseProtocols, prettyIfJson, toWsUrl } from './websocket'

describe('toWsUrl', () => {
  it('convierte http y https', () => {
    expect(toWsUrl('http://localhost:3000/chat')).toBe('ws://localhost:3000/chat')
    expect(toWsUrl('HTTPS://api.x.com/stream')).toBe('wss://api.x.com/stream')
  })

  it('respeta ws y wss', () => {
    expect(toWsUrl('ws://a.com')).toBe('ws://a.com')
    expect(toWsUrl('wss://a.com/x')).toBe('wss://a.com/x')
  })

  it('agrega ws:// cuando no hay esquema', () => {
    expect(toWsUrl('localhost:8080/chat')).toBe('ws://localhost:8080/chat')
    expect(toWsUrl('  api.x.com ')).toBe('ws://api.x.com')
  })
})

describe('parseHeaderLines', () => {
  it('lee Nombre: valor y respeta los ":" del valor', () => {
    const r = parseHeaderLines('Authorization: Bearer abc\nOrigin: http://localhost:3000')
    expect(r.headers).toEqual({ Authorization: 'Bearer abc', Origin: 'http://localhost:3000' })
    expect(r.invalid).toEqual([])
  })

  it('ignora vacías y comentarios, y reporta las inválidas', () => {
    const r = parseHeaderLines('# nota\n\nX-Ok: 1\nsin dos puntos\n: vacío\nMal nombre: x')
    expect(r.headers).toEqual({ 'X-Ok': '1' })
    expect(r.invalid).toEqual(['sin dos puntos', ': vacío', 'Mal nombre: x'])
  })

  it('descarta los headers que maneja el handshake', () => {
    const r = parseHeaderLines('Upgrade: websocket\nSec-WebSocket-Key: x\nX-A: 1')
    expect(r.headers).toEqual({ 'X-A': '1' })
    expect(r.ignored).toEqual(['Upgrade', 'Sec-WebSocket-Key'])
  })
})

describe('parseProtocols', () => {
  it('separa por coma o espacio', () => {
    expect(parseProtocols('graphql-ws, chat  v2')).toEqual(['graphql-ws', 'chat', 'v2'])
    expect(parseProtocols('  ')).toEqual([])
  })
})

describe('hexPreview', () => {
  it('muestra los bytes en hex', () => {
    expect(hexPreview(new Uint8Array([0, 15, 255]))).toBe('00 0f ff')
  })

  it('recorta y dice cuántos bytes faltan', () => {
    expect(hexPreview(new Uint8Array(10), 4)).toBe('00 00 00 00 … (+6 bytes)')
  })
})

describe('prettyIfJson', () => {
  it('indenta JSON', () => {
    expect(prettyIfJson('{"a":1}')).toEqual({ text: '{\n  "a": 1\n}', json: true })
  })

  it('deja igual lo que no es JSON', () => {
    expect(prettyIfJson('hola')).toEqual({ text: 'hola', json: false })
    expect(prettyIfJson('{roto')).toEqual({ text: '{roto', json: false })
  })
})