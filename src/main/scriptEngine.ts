import { Script, createContext } from 'node:vm'
import type { ScriptInput, ScriptOutput, ScriptRequest, ScriptTest } from '../shared/types'

/** Tiempo máximo de CPU de un script. Un bucle infinito se corta aquí */
export const SCRIPT_TIMEOUT_MS = 2000
const MAX_CODE_CHARS = 100_000
const MAX_BODY_CHARS = 2_000_000
const MAX_OUTPUT_CHARS = 1_000_000

/**
 * Código que corre DENTRO del contexto aislado. Ningún objeto del proceso principal entra al
 * contexto: los datos viajan como texto JSON y el resultado sale igual. Así un script no puede
 * llegar a `process` ni a `require` por la cadena de constructores.
 */
const RUNNER = `
(() => {
  'use strict'
  const input = JSON.parse(__INPUT__)
  const vars = Object.assign(Object.create(null), input.vars)
  const logs = []
  const tests = []
  const envSet = {}
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

  const show = (v) => {
    if (typeof v === 'string') return v
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  const log = (...args) => {
    if (logs.length < 100) logs.push(args.map(show).join(' ').slice(0, 500))
  }
  const sandboxConsole = { log, info: log, warn: log, error: log, debug: log }

  const fail = (msg) => { throw new Error(msg) }
  const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)

  const isSubset = (a, b) => {
    if (b === null || typeof b !== 'object') return Object.is(a, b)
    if (a === null || typeof a !== 'object') return false
    if (Array.isArray(b)) {
      return Array.isArray(a) && a.length === b.length && b.every((x, i) => isSubset(a[i], x))
    }
    return Object.keys(b).every((k) => has(a, k) && isSubset(a[k], b[k]))
  }

  const expect = (actual) => {
    const build = (negate) => {
      const check = (ok, msg) => { if (negate ? ok : !ok) fail(msg) }
      const m = {
        toBe: (e) => check(Object.is(actual, e), 'se esperaba ' + show(e) + ' y llegó ' + show(actual)),
        toEqual: (e) => check(deepEqual(actual, e), 'se esperaba ' + show(e) + ' y llegó ' + show(actual)),
        toBeTruthy: () => check(!!actual, 'se esperaba un valor verdadero y llegó ' + show(actual)),
        toBeFalsy: () => check(!actual, 'se esperaba un valor falso y llegó ' + show(actual)),
        toContain: (e) => check(actual != null && typeof actual.includes === 'function' && actual.includes(e), show(actual) + ' no contiene ' + show(e)),
        toMatch: (re) => check(new RegExp(re).test(String(actual)), show(actual) + ' no coincide con ' + show(re)),
        toBeGreaterThan: (n) => check(actual > n, show(actual) + ' no es mayor que ' + show(n)),
        toBeLessThan: (n) => check(actual < n, show(actual) + ' no es menor que ' + show(n)),
        toHaveProperty: (k) => check(actual != null && typeof actual === 'object' && k in actual, 'falta la propiedad ' + show(k)),
        toBeGreaterThanOrEqual: (n) => check(actual >= n, show(actual) + ' no es mayor o igual que ' + show(n)),
        toBeLessThanOrEqual: (n) => check(actual <= n, show(actual) + ' no es menor o igual que ' + show(n)),
        toBeBetween: (min, max) => check(actual >= min && actual <= max, show(actual) + ' no está entre ' + show(min) + ' y ' + show(max)),
        toBeNull: () => check(actual === null, 'se esperaba null y llegó ' + show(actual)),
        toBeType: (t) => check(typeOf(actual) === t, 'se esperaba tipo ' + show(t) + ' y llegó ' + typeOf(actual)),
        toHaveLength: (n) => check(actual != null && actual.length === n, 'se esperaba longitud ' + show(n) + ' y llegó ' + (actual == null ? show(actual) : actual.length)),
        toBeOneOf: (list) => check(Array.isArray(list) && list.some((x) => Object.is(x, actual)), show(actual) + ' no está en ' + show(list)),
        toMatchObject: (sub) => check(isSubset(actual, sub), show(actual) + ' no contiene la estructura ' + show(sub))
      }
      return m
    }
    const api = build(false)
    api.not = build(true)
    return api
  }

    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

  const utf8Bytes = (s) => {
    const enc = encodeURIComponent(s)
    const out = []
    for (let i = 0; i < enc.length; i++) {
      if (enc[i] === '%') { out.push(parseInt(enc.slice(i + 1, i + 3), 16)); i += 2 } else out.push(enc.charCodeAt(i))
    }
    return out
  }

  const b64encode = (s) => {
    const b = utf8Bytes(String(s))
    let out = ''
    for (let i = 0; i < b.length; i += 3) {
      const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0)
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
      out += i + 1 < b.length ? B64[(n >> 6) & 63] : '='
      out += i + 2 < b.length ? B64[n & 63] : '='
    }
    return out
  }

  const b64decode = (s) => {
    const clean = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
    const bytes = []
    let buf = 0
    let bits = 0
    for (const ch of clean) {
      const v = B64.indexOf(ch)
      if (v < 0) fail('base64 inválido')
      buf = ((buf << 6) | v) & 0xffff
      bits += 6
      if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 255) }
    }
    try {
      return decodeURIComponent(bytes.map((b) => '%' + b.toString(16).padStart(2, '0')).join(''))
    } catch {
      return bytes.map((b) => String.fromCharCode(b)).join('')
    }
  }

  const jwtDecode = (token) => {
    const parts = String(token).replace(/^Bearer /i, '').split('.')
    if (parts.length < 2) fail('no es un JWT')
    try {
      return { header: JSON.parse(b64decode(parts[0])), payload: JSON.parse(b64decode(parts[1])) }
    } catch {
      fail('el JWT es ilegible')
    }
  }

  const uuid = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16)
      return (c === 'x' ? r : (r & 3) | 8).toString(16)
    })

  const sonda = {
    env: {
      get: (k) => (has(vars, String(k)) ? vars[String(k)] : undefined),
      set: (k, v) => {
        const key = String(k).trim()
        if (!key) fail('sonda.env.set necesita un nombre de variable')
        vars[key] = String(v)
        envSet[key] = String(v)
      }
    },
    test: (name, fn) => {
      try {
        fn()
        tests.push({ name: String(name), passed: true, message: '' })
      } catch (e) {
        tests.push({ name: String(name), passed: false, message: String((e && e.message) || e) })
      }
    },
    assert: (cond, msg) => { if (!cond) fail(msg ? String(msg) : 'la condición no se cumple') },
    expect,
    uuid,
    now: () => Date.now(),
    base64: { encode: b64encode, decode: b64decode },
    jwt: { decode: jwtDecode }
  }

  if (input.phase === 'pre') {
    sonda.request = {
      method: input.request.method,
      url: input.request.url,
      headers: Object.assign({}, input.request.headers),
      body: input.request.body
    }
  } else {
    const res = input.response
    const text = res.body
    const lowerHeaders = Object.create(null)
    for (const k of Object.keys(res.headers || {})) lowerHeaders[k.toLowerCase()] = res.headers[k]
    sonda.response = {
      status: res.status,
      statusText: res.statusText,
      timeMs: res.timeMs,
      ok: res.status >= 200 && res.status < 300,
      headers: Object.assign({}, res.headers),
      header: (name) => lowerHeaders[String(name).toLowerCase()],
      text,
      json: () => JSON.parse(text)
    }
  }

  let error = ''
  try {
    new Function('sonda', 'console', __CODE__)(sonda, sandboxConsole)
  } catch (e) {
    error = String((e && e.message) || e)
  }

  const out = { error, logs, tests, envSet }
  if (input.phase === 'pre') {
    const r = sonda.request
    out.request = {
      method: String(r.method),
      url: String(r.url),
      headers: Object.fromEntries(Object.entries(r.headers || {}).map(([k, v]) => [k, String(v)])),
      body: r.body == null ? '' : String(r.body)
    }
  }
  return JSON.stringify(out)
})()
`

const lit = (s: string): string => JSON.stringify(s)

const fail = (error: string): ScriptOutput => ({
  ok: false,
  error,
  logs: [],
  tests: [],
  envSet: {}
})

const isStringMap = (v: unknown): v is Record<string, string> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.values(v).every((x) => typeof x === 'string')

/** Ejecuta un script de usuario en un contexto aislado y devuelve lo que hizo */
export function runScript(input: ScriptInput): ScriptOutput {
  if (typeof input?.code !== 'string' || (input.phase !== 'pre' && input.phase !== 'post')) {
    return fail('Entrada del script inválida')
  }
  if (input.code.length > MAX_CODE_CHARS) return fail('El script es demasiado largo')

  const payload: ScriptInput = {
    ...input,
    ...(input.response
      ? { response: { ...input.response, body: input.response.body.slice(0, MAX_BODY_CHARS) } }
      : {})
  }

  const source = RUNNER.replace('__INPUT__', () => lit(JSON.stringify(payload))).replace(
    '__CODE__',
    () => lit(input.code)
  )

  let raw: unknown
  try {
    const context = createContext(Object.create(null), {
      codeGeneration: { strings: true, wasm: false }
    })
    raw = new Script(source, { filename: 'sonda-script.js' }).runInContext(context, {
      timeout: SCRIPT_TIMEOUT_MS
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return fail(
      /timed out/i.test(msg)
        ? `El script tardó más de ${SCRIPT_TIMEOUT_MS / 1000} s y se detuvo`
        : msg
    )
  }

  if (typeof raw !== 'string' || raw.length > MAX_OUTPUT_CHARS) {
    return fail('El script devolvió un resultado inválido o demasiado grande')
  }

  // Lo que sale del contexto se trata como dato no confiable
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return fail('El script devolvió un resultado ilegible')
  }

  const error = typeof parsed.error === 'string' ? parsed.error : ''
  const logs = Array.isArray(parsed.logs)
    ? parsed.logs.filter((l): l is string => typeof l === 'string')
    : []
  const tests: ScriptTest[] = Array.isArray(parsed.tests)
    ? parsed.tests
        .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
        .map((t) => ({
          name: String(t.name ?? ''),
          passed: t.passed === true,
          message: String(t.message ?? '')
        }))
    : []
  const envSet = isStringMap(parsed.envSet) ? parsed.envSet : {}

  let request: ScriptRequest | undefined
  const r = parsed.request as Record<string, unknown> | undefined
  if (input.phase === 'pre' && r && typeof r.method === 'string' && typeof r.url === 'string') {
    request = {
      method: r.method,
      url: r.url,
      headers: isStringMap(r.headers) ? r.headers : {},
      body: typeof r.body === 'string' ? r.body : ''
    }
  }

  return { ok: error === '', error, logs, tests, envSet, ...(request ? { request } : {}) }
}
