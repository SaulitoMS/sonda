import { createServer, type ServerResponse } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { ipcMain, shell } from 'electron'
import type { OAuthAuthorizeInput, OAuthAuthorizeResult } from '../shared/types'

/** Tiempo que se espera a que la persona termine de iniciar sesión en el navegador */
const LOGIN_TIMEOUT_MS = 180_000

/** Cancela el intento en curso (si hay uno) para que no queden puertos abiertos */
let cancelActive: (() => void) | null = null

const base64Url = (buf: Buffer): string => buf.toString('base64url')

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function isHttpUrl(text: string): boolean {
  try {
    const { protocol } = new URL(text)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function reply(
  res: ServerResponse,
  status: number,
  title: string,
  detail: string,
  done: () => void
): void {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Sonda</title></head>
<body style="font-family:system-ui,sans-serif;background:#18181b;color:#e4e4e7;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="text-align:center;max-width:420px;padding:24px">
<h2 style="margin:0 0 8px">${escapeHtml(title)}</h2>
<p style="margin:0;color:#a1a1aa">${escapeHtml(detail)}</p>
</div></body></html>`
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    // Sin keep-alive el servidor se cierra apenas termina la respuesta
    Connection: 'close'
  })
  res.end(html, done)
}

function authorize(input: OAuthAuthorizeInput): Promise<OAuthAuthorizeResult> {
  if (!isHttpUrl(input.authUrl)) {
    return Promise.resolve({
      ok: false,
      error: 'La URL de autorización debe empezar con http:// o https://'
    })
  }

  cancelActive?.()

  return new Promise<OAuthAuthorizeResult>((resolve) => {
    const verifier = base64Url(randomBytes(32))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())
    const state = base64Url(randomBytes(16))
    const port =
      Number.isInteger(input.port) && input.port >= 0 && input.port <= 65535 ? input.port : 0

    let settled = false
    let redirectUri = ''

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404, { Connection: 'close' })
        res.end()
        return
      }

      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')

      if (url.searchParams.get('state') !== state) {
        reply(res, 400, 'Respuesta no válida', 'El parámetro state no coincide.', () =>
          finish({ ok: false, error: 'El parámetro state no coincide (posible intento de CSRF).' })
        )
      } else if (error) {
        const description = url.searchParams.get('error_description')
        reply(res, 400, 'Acceso denegado', description ?? error, () =>
          finish({
            ok: false,
            error: `El servidor rechazó el acceso: ${error}${description ? ` · ${description}` : ''}`
          })
        )
      } else if (!code) {
        reply(res, 400, 'Respuesta incompleta', 'No llegó el código de autorización.', () =>
          finish({ ok: false, error: 'La redirección no trajo el código de autorización.' })
        )
      } else {
        reply(res, 200, 'Listo, ya puedes volver a Sonda', 'Puedes cerrar esta pestaña.', () =>
          finish({ ok: true, code, verifier, redirectUri })
        )
      }
    })

    const timer = setTimeout(
      () => finish({ ok: false, error: 'Se agotó el tiempo esperando el inicio de sesión.' }),
      LOGIN_TIMEOUT_MS
    )

    function finish(result: OAuthAuthorizeResult): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      if (cancelActive === cancel) cancelActive = null
      resolve(result)
    }

    const cancel = (): void =>
      finish({ ok: false, error: 'Se inició otro inicio de sesión y este se canceló.' })
    cancelActive = cancel

    server.on('error', (err: NodeJS.ErrnoException) => {
      finish({
        ok: false,
        error:
          err.code === 'EADDRINUSE'
            ? `El puerto ${port} ya está en uso. Cambia el puerto de callback o déjalo en 0.`
            : `No se pudo abrir el servidor local: ${err.message}`
      })
    })

    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      const realPort = typeof address === 'object' && address ? address.port : port
      redirectUri = `http://127.0.0.1:${realPort}/callback`

      const target = new URL(input.authUrl)
      target.searchParams.set('response_type', 'code')
      target.searchParams.set('client_id', input.clientId)
      target.searchParams.set('redirect_uri', redirectUri)
      target.searchParams.set('code_challenge', challenge)
      target.searchParams.set('code_challenge_method', 'S256')
      target.searchParams.set('state', state)
      if (input.scope) target.searchParams.set('scope', input.scope)

      // Parámetros extra del proveedor (audience, prompt, access_type…): no pisan los que fija Sonda
      const extra = new URLSearchParams((input.extraParams ?? '').replace(/^[?&]+/, ''))
      extra.forEach((value, key) => {
        if (!target.searchParams.has(key)) target.searchParams.set(key, value)
      })

      shell.openExternal(target.toString()).catch((err: unknown) => {
        finish({
          ok: false,
          error: `No se pudo abrir el navegador: ${err instanceof Error ? err.message : String(err)}`
        })
      })
    })
  })
}

export function registerOAuthHandlers(): void {
  ipcMain.handle('oauth:authorize', (_e, input: OAuthAuthorizeInput) => authorize(input))
}
