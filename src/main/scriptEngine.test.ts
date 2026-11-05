import { describe, expect, it } from 'vitest'
import type { ScriptResponse } from '../shared/types'
import { runScript } from './scriptEngine'

const response: ScriptResponse = {
  status: 201,
  statusText: 'Created',
  timeMs: 120,
  headers: { 'Content-Type': 'application/json', 'X-Id': '7' },
  body: JSON.stringify({ id: 7, name: 'Ana', tags: ['a', 'b'], owner: { email: 'a@b.com' } })
}

const post = (code: string): ReturnType<typeof runScript> =>
  runScript({ phase: 'post', code, vars: {}, response })

const pre = (code: string, vars: Record<string, string> = {}): ReturnType<typeof runScript> =>
  runScript({
    phase: 'pre',
    code,
    vars,
    request: { method: 'GET', url: 'https://x.test/a', headers: { Accept: '*/*' }, body: '' }
  })

describe('compatibilidad con pm.* de Postman', () => {
  it('ejecuta un script de tests típico', () => {
    const out = post(`
      const json = pm.response.json();
      pm.test("status", () => { pm.response.to.have.status(201); pm.response.to.be.success; });
      pm.test("tiempo", () => { pm.expect(pm.response.responseTime).to.be.below(500); });
      pm.test("campos", () => {
        pm.expect(json.name).to.equal("Ana");
        pm.expect(json.id).to.be.a("number");
        pm.expect(json).to.have.property("id", 7);
      });
      pm.test("encadenado", () => { pm.expect(json.tags).to.include("b").and.have.lengthOf(2); });
      pm.test("negado y deep", () => {
        pm.expect(json.name).to.not.equal("Bob");
        pm.expect(json.owner).to.deep.equal({ email: "a@b.com" });
      });
      pm.test("header", () => { pm.response.to.have.header("x-id", "7"); });
      pm.test("falla", () => { pm.expect(json.id).to.equal(8); });
      pm.environment.set("userId", json.id);
      postman.setEnvironmentVariable("legacy", "1");
    `)
    expect(out.ok).toBe(true)
    expect(out.envSet).toEqual({ userId: '7', legacy: '1' })
    const passed = Object.fromEntries(out.tests.map((t) => [t.name, t.passed]))
    expect(passed).toEqual({
      status: true,
      tiempo: true,
      campos: true,
      encadenado: true,
      'negado y deep': true,
      header: true,
      falla: false
    })
  })

  it('en el pre-script modifica los headers de la petición', () => {
    const out = pre(
      `
      pm.request.headers.add({ key: "X-Token", value: pm.environment.get("tok") });
      pm.request.headers.upsert({ key: "accept", value: "application/json" });
    `,
      { tok: 'abc' }
    )
    expect(out.ok).toBe(true)
    expect(out.request?.headers).toEqual({ 'X-Token': 'abc', accept: 'application/json' })
  })

  it('pm.sendRequest falla con un mensaje claro', () => {
    const out = pre('pm.sendRequest("https://x.test", () => {})')
    expect(out.ok).toBe(false)
    expect(out.error).toContain('pm.sendRequest')
  })

  it('sonda.* sigue funcionando igual', () => {
    const out = post('sonda.test("ok", () => sonda.expect(sonda.response.status).toBe(201))')
    expect(out.tests[0].passed).toBe(true)
  })
})
