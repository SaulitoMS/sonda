export type ScriptSnippet = {
  id: string
  label: string
  phase: 'pre' | 'post'
  code: string
}

export const SCRIPT_SNIPPETS: ScriptSnippet[] = [
  {
    id: 'pre-request-id',
    label: 'X-Request-Id único',
    phase: 'pre',
    code: "sonda.request.headers['X-Request-Id'] = sonda.uuid()"
  },
  {
    id: 'pre-timestamp',
    label: 'Header con timestamp',
    phase: 'pre',
    code: "sonda.request.headers['X-Timestamp'] = String(sonda.now())"
  },
  {
    id: 'pre-hmac',
    label: 'Firma HMAC-SHA256',
    phase: 'pre',
    code: [
      'const ts = String(sonda.now())',
      "const firma = sonda.crypto.hmacSha256(sonda.env.get('secret'), ts + sonda.request.body, 'hex')",
      "sonda.request.headers['X-Timestamp'] = ts",
      "sonda.request.headers['X-Signature'] = firma"
    ].join('\n')
  },
  {
    id: 'post-status-ok',
    label: 'Status 200',
    phase: 'post',
    code: "sonda.test('status 200', () => sonda.expect(sonda.response.status).toBe(200))"
  },
  {
    id: 'post-fast',
    label: 'Responde en menos de 500 ms',
    phase: 'post',
    code: "sonda.test('rápida', () => sonda.expect(sonda.response.timeMs).toBeLessThan(500))"
  },
  {
    id: 'post-json',
    label: 'Content-Type JSON',
    phase: 'post',
    code: "sonda.test('es JSON', () => sonda.expect(sonda.response.header('content-type')).toContain('application/json'))"
  },
  {
    id: 'post-save-token',
    label: 'Guardar token en el entorno',
    phase: 'post',
    code: ['const data = sonda.response.json()', "sonda.env.set('token', data.token)"].join('\n')
  },
  {
    id: 'post-jwt-exp',
    label: 'Verificar que el JWT no ha expirado',
    phase: 'post',
    code: [
      'const { payload } = sonda.jwt.decode(sonda.response.json().token)',
      "sonda.test('JWT vigente', () => sonda.expect(payload.exp * 1000).toBeGreaterThan(sonda.now()))"
    ].join('\n')
  }
]

/** Agrega el snippet al final del script actual, separado por una línea en blanco */
export function appendSnippet(current: string, code: string): string {
  const base = current.replace(/\s+$/, '')
  return base ? `${base}\n\n${code}` : code
}
