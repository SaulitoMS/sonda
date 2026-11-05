import { describe, expect, it } from 'vitest'
import { buildBugReport, type BugReportInput } from './bugReport'

const input: BugReportInput = {
  request: {
    method: 'POST',
    url: 'https://api.com/login?api_key=abc123',
    headers: [
      { key: 'Content-Type', value: 'application/json' },
      { key: 'Authorization', value: 'Bearer secreto123' }
    ],
    body: '{"user":"ana","password":"hunter2"}'
  },
  response: {
    status: 401,
    statusText: 'Unauthorized',
    timeMs: 120,
    sizeBytes: 2048,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: '{"error":"bad","token":"tok_999"}'
  }
}

const withResponseBody = (body: string): BugReportInput => ({
  ...input,
  response: { ...input.response, body }
})

describe('buildBugReport', () => {
  const report = buildBugReport(input)

  it('resume petición y respuesta en una línea', () => {
    expect(report).toContain('**POST** `https://api.com/login?api_key=<oculto>`')
    expect(report).toContain('→ **401 Unauthorized** · 120 ms · 2.0 KB · application/json')
  })

  it('oculta credenciales de la URL, headers y bodies', () => {
    expect(report).toContain('Bearer <oculto>')
    for (const secret of ['secreto123', 'abc123', 'hunter2', 'tok_999']) {
      expect(report).not.toContain(secret)
    }
  })

  it('deja el JSON formateado', () => {
    expect(report).toContain('"user": "ana"')
    expect(report).toContain('"error": "bad"')
  })

  it('recorta los bodies largos', () => {
    const long = buildBugReport(withResponseBody('x'.repeat(5000)))
    expect(long).toContain('recortado: 5000 caracteres')
    expect(long.length).toBeLessThan(5000)
  })

  it('avisa si la respuesta no trae body', () => {
    expect(buildBugReport(withResponseBody(''))).toContain('_La respuesta no trae body de texto._')
  })

  it('alarga la cerca si el body trae comillas invertidas', () => {
    expect(buildBugReport(withResponseBody('a ``` b'))).toContain('````')
  })
})
