import { dialog, ipcMain } from 'electron'
import { openAsBlob } from 'fs'
import { stat } from 'fs/promises'
import { basename } from 'path'
import type { FormPart, SendRequestInput, SendRequestResult } from '../shared/types'
import { Agent, ProxyAgent, type Dispatcher } from 'undici'
import { cookieHeaderFor, storeCookies } from './cookieJar'
import { proxyError } from '../shared/settings'
import { loadSettings } from './settings'

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

const dispatchers = new Map<string, Dispatcher>()

/** Reutiliza un cliente por combinación de proxy + verificación TLS */
function dispatcherFor(proxyUrl: string, ignoreTls: boolean): Dispatcher {
  const key = `${proxyUrl}|${ignoreTls}`
  let dispatcher = dispatchers.get(key)
  if (!dispatcher) {
    dispatcher = proxyUrl
      ? new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: !ignoreTls } })
      : new Agent({ connect: { rejectUnauthorized: !ignoreTls } })
    dispatchers.set(key, dispatcher)
  }
  return dispatcher
}

/** En localhost no hay un tercero que suplantar, así que se tolera el cert autofirmado */
const isLoopbackHost = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '[::1]' ||
  /^127(\.\d{1,3}){3}$/.test(hostname)

/** Peticiones en curso: id → función que las cancela */
const inFlight = new Map<string, () => void>()

const MAX_BINARY_BYTES = 20 * 1024 * 1024

/** ¿La respuesta es un archivo y no texto? Se decide por Content-Type y, si no basta, por el contenido */
function isBinaryResponse(contentType: string, bytes: Uint8Array): boolean {
  const type = contentType.split(';')[0].trim().toLowerCase()
  if (type === 'image/svg+xml') return false
  if (/^(image|audio|video|font)\//.test(type)) return true
  if (
    /[/+.-](pdf|zip|gzip|tar|rar|7z-compressed|wasm|msword|officedocument|ms-excel|ms-powerpoint)/.test(
      type
    )
  ) {
    return true
  }
  // Cualquier otro tipo (o ninguno): un byte NUL al inicio delata un archivo
  return bytes.subarray(0, 1024).includes(0)
}

/** Arma el multipart leyendo los archivos desde disco, sin cargarlos enteros en memoria */
async function buildFormData(parts: FormPart[]): Promise<FormData> {
  const form = new FormData()
  for (const part of parts) {
    if (part.kind === 'text') {
      form.append(part.key, part.value)
      continue
    }
    if (!part.value.trim()) {
      throw new Error(`El campo "${part.key}" no tiene archivo seleccionado`)
    }
    const info = await stat(part.value).catch(() => null)
    if (!info?.isFile()) {
      throw new Error(`No se encontró el archivo del campo "${part.key}": ${part.value}`)
    }
    if (info.size > MAX_UPLOAD_BYTES) {
      throw new Error(`El archivo del campo "${part.key}" supera los 100 MB`)
    }
    form.append(part.key, await openAsBlob(part.value), basename(part.value))
  }
  return form
}

export function registerHttpHandlers(): void {
  ipcMain.handle(
    'http:send',
    async (_event, input: SendRequestInput): Promise<SendRequestResult> => {
      const start = performance.now()

      let url: URL
      try {
        url = new URL(input.url)
      } catch {
        return { ok: false, error: 'URL inválida. Incluye http:// o https://', timeMs: 0 }
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, error: 'Solo se permiten URLs http y https', timeMs: 0 }
      }

      const settings = await loadSettings()
      const loopback = isLoopbackHost(url.hostname)

      // Lo que venga en la petición tiene prioridad sobre los ajustes globales
      const insecure =
        input.insecure ??
        (settings.sslMode === 'ignore' || (settings.sslMode === 'auto' && loopback))
      const ignoreTls = insecure && url.protocol === 'https:'
      // localhost nunca pasa por el proxy
      const proxyUrl =
        settings.proxyUrl && !proxyError(settings.proxyUrl) && !loopback ? settings.proxyUrl : ''

      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        input.timeoutMs ?? settings.timeoutSeconds * 1000
      )

      // Distingue "el usuario canceló" de "se acabó el tiempo"
      const state = { cancelled: false }
      if (input.requestId) {
        inFlight.set(input.requestId, () => {
          state.cancelled = true
          controller.abort()
        })
      }

      try {
        const headers = new Headers()
        for (const h of input.headers) {
          if (h.key.trim()) headers.append(h.key.trim(), h.value)
        }

        // Cookies guardadas de respuestas anteriores (salvo que el usuario ponga su propio Cookie)
        if (!headers.has('cookie')) {
          const cookie = cookieHeaderFor(url)
          if (cookie) headers.set('cookie', cookie)
        }

        const canHaveBody = !['GET', 'HEAD'].includes(input.method)
        let body: string | FormData | undefined
        if (canHaveBody && input.formData) {
          body = await buildFormData(input.formData)
          // fetch pone su propio Content-Type con el boundary; uno escrito a mano lo rompería
          headers.delete('content-type')
        } else if (canHaveBody && input.body) {
          body = input.body
        }

        const res = await fetch(url, {
          method: input.method,
          headers,
          body,
          signal: controller.signal,
          redirect: (input.followRedirects ?? settings.followRedirects) ? 'follow' : 'manual',
          ...(ignoreTls || proxyUrl ? { dispatcher: dispatcherFor(proxyUrl, ignoreTls) } : {})
        })

        // Guarda las cookies de la respuesta (res.url es la URL final si hubo redirecciones)
        storeCookies(new URL(res.url || url.href), res.headers.getSetCookie())

        const buffer = await res.arrayBuffer()
        const timeMs = Math.round(performance.now() - start)

        const resHeaders: Record<string, string> = {}
        res.headers.forEach((value, key) => {
          resHeaders[key] = value
        })

        const bytes = new Uint8Array(buffer)
        const contentType = res.headers.get('content-type') ?? ''
        const binary = isBinaryResponse(contentType, bytes)
        const tooBig = buffer.byteLength > MAX_BINARY_BYTES

        return {
          ok: true,
          status: res.status,
          statusText: res.statusText,
          headers: resHeaders,
          body: binary ? '' : new TextDecoder('utf-8').decode(bytes),
          ...(binary
            ? {
                binary: {
                  contentType:
                    contentType.split(';')[0].trim().toLowerCase() || 'application/octet-stream',
                  base64: tooBig ? '' : Buffer.from(buffer).toString('base64'),
                  truncated: tooBig
                }
              }
            : {}),
          timeMs,
          sizeBytes: buffer.byteLength
        }
      } catch (err) {
        const timeMs = Math.round(performance.now() - start)
        if (err instanceof Error && err.name === 'AbortError') {
          return {
            ok: false,
            error: state.cancelled ? 'Petición cancelada' : 'La petición excedió el tiempo límite',
            timeMs
          }
        }
        const cause =
          err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : ''
        return {
          ok: false,
          error: (err instanceof Error ? err.message : 'Error desconocido') + cause,
          timeMs
        }
      } finally {
        clearTimeout(timeout)
        if (input.requestId) inFlight.delete(input.requestId)
      }
    }
  )

  ipcMain.handle('http:cancel', (_event, requestId: string): void => {
    inFlight.get(requestId)?.()
  })

  ipcMain.handle('files:pick', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}
