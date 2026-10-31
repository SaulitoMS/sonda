import { dialog, ipcMain } from 'electron'
import { openAsBlob } from 'fs'
import { stat } from 'fs/promises'
import { basename } from 'path'
import type { FormPart, SendRequestInput, SendRequestResult } from '../shared/types'
import { Agent, ProxyAgent, type Dispatcher } from 'undici'
import { cookieHeaderFor, storeCookies } from './cookieJar'
import { proxyError } from '../shared/settings'
import { loadSettings } from './settings'
import { collectEventStream, isEventStream } from '../shared/sse'
import { sendFollowingRedirects } from '../shared/redirects'

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
/** Tope absoluto de lo que se lee de una respuesta; más allá se corta para no agotar la memoria */
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024
/** Tope de lo que se acumula de un stream de eventos (SSE) */
const MAX_STREAM_BYTES = 20 * 1024 * 1024

class ResponseTooLargeError extends Error {}

/** Lee el body por partes y corta si supera el límite, para no agotar la memoria con descargas enormes */
async function readBodyCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'))
  if (declared > max) {
    await res.body?.cancel()
    throw new ResponseTooLargeError()
  }
  if (!res.body) return new Uint8Array(0)

  const chunks: Uint8Array[] = []
  let total = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      throw new ResponseTooLargeError()
    }
    chunks.push(value)
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

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
    async (event, input: SendRequestInput): Promise<SendRequestResult> => {
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

        // fetch resuelve al llegar los headers: es el tiempo hasta el primer byte
        const ttfbMs = Math.round(performance.now() - start)

        // Guarda las cookies de la respuesta (res.url es la URL final si hubo redirecciones)
        storeCookies(new URL(res.url || url.href), res.headers.getSetCookie())

        const resHeaders: Record<string, string> = {}
        res.headers.forEach((value, key) => {
          resHeaders[key] = value
        })
        const contentType = res.headers.get('content-type') ?? ''

        // Server-Sent Events: no terminan solos, así que se leen por trozos en vez de esperar el final
        if (isEventStream(contentType)) {
          // Desde la pestaña el stream dura hasta que el servidor lo cierre o el usuario cancele
          if (input.live) clearTimeout(timeout)

          const streamed = await collectEventStream(res, {
            max: MAX_STREAM_BYTES,
            wasCancelled: () => state.cancelled,
            onText: (chunk) => {
              if (input.live && input.requestId && !event.sender.isDestroyed()) {
                event.sender.send('http:stream', { requestId: input.requestId, chunk })
              }
            }
          })

          return {
            ok: true,
            status: res.status,
            statusText: res.statusText,
            headers: resHeaders,
            body: streamed.text,
            timeMs: Math.round(performance.now() - start),
            ttfbMs,
            sizeBytes: Buffer.byteLength(streamed.text),
            stream: {
              endedBy: streamed.endedBy,
              ...(streamed.error ? { error: streamed.error } : {})
            }
          }
        }

        const buffer = await readBodyCapped(res, MAX_RESPONSE_BYTES)
        const timeMs = Math.round(performance.now() - start)

        const bytes = buffer
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
          ttfbMs: Math.min(ttfbMs, timeMs),
          sizeBytes: buffer.byteLength
        }
      } catch (err) {
        const timeMs = Math.round(performance.now() - start)
        if (err instanceof ResponseTooLargeError) {
          return {
            ok: false,
            error: `La respuesta supera los ${MAX_RESPONSE_BYTES / 1024 / 1024} MB y se descartó para no agotar la memoria`,
            timeMs
          }
        }
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

  ipcMain.handle(
    'http:send',
    async (event, input: SendRequestInput): Promise<SendRequestResult> => {
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

      // TLS y proxy se deciden por servidor: una redirección puede llevar a otro host
      const connectionFor = (target: URL): { dispatcher?: Dispatcher } => {
        const loopback = isLoopbackHost(target.hostname)
        // Lo que venga en la petición tiene prioridad sobre los ajustes globales
        const insecure =
          input.insecure ??
          (settings.sslMode === 'ignore' || (settings.sslMode === 'auto' && loopback))
        const ignoreTls = insecure && target.protocol === 'https:'
        // localhost nunca pasa por el proxy
        const proxyUrl =
          settings.proxyUrl && !proxyError(settings.proxyUrl) && !loopback ? settings.proxyUrl : ''
        return ignoreTls || proxyUrl ? { dispatcher: dispatcherFor(proxyUrl, ignoreTls) } : {}
      }

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

        const canHaveBody = !['GET', 'HEAD'].includes(input.method)
        let body: string | FormData | undefined
        if (canHaveBody && input.formData) {
          body = await buildFormData(input.formData)
          // fetch pone su propio Content-Type con el boundary; uno escrito a mano lo rompería
          headers.delete('content-type')
        } else if (canHaveBody && input.body) {
          body = input.body
        }

        // Las redirecciones se siguen a mano para ver cada salto y llevar las cookies en cada uno
        let cookieIsUsers = headers.has('cookie')
        const {
          res,
          url: finalUrl,
          hops
        } = await sendFollowingRedirects({
          url,
          method: input.method,
          headers,
          body,
          follow: input.followRedirects ?? settings.followRedirects,
          send: (target, init) =>
            fetch(target, {
              ...init,
              signal: controller.signal,
              redirect: 'manual',
              ...connectionFor(target)
            }),
          // Cookies guardadas de respuestas anteriores (salvo que el usuario ponga su propio Cookie)
          beforeSend: (target, h) => {
            if (cookieIsUsers && h.has('cookie')) return
            cookieIsUsers = false
            h.delete('cookie')
            const cookie = cookieHeaderFor(target)
            if (cookie) h.set('cookie', cookie)
          },
          afterResponse: (target, r) => storeCookies(target, r.headers.getSetCookie())
        })
        const redirectInfo = hops.length > 0 ? { redirects: hops, finalUrl: finalUrl.href } : {}

        // Los headers de la respuesta final ya llegaron: es el tiempo hasta el primer byte
        const ttfbMs = Math.round(performance.now() - start)

        const resHeaders: Record<string, string> = {}
        res.headers.forEach((value, key) => {
          resHeaders[key] = value
        })
        const contentType = res.headers.get('content-type') ?? ''

        // Server-Sent Events: no terminan solos, así que se leen por trozos en vez de esperar el final
        if (isEventStream(contentType)) {
          // Desde la pestaña el stream dura hasta que el servidor lo cierre o el usuario cancele
          if (input.live) clearTimeout(timeout)

          const streamed = await collectEventStream(res, {
            max: MAX_STREAM_BYTES,
            wasCancelled: () => state.cancelled,
            onText: (chunk) => {
              if (input.live && input.requestId && !event.sender.isDestroyed()) {
                event.sender.send('http:stream', { requestId: input.requestId, chunk })
              }
            }
          })

          return {
            ok: true,
            status: res.status,
            statusText: res.statusText,
            headers: resHeaders,
            body: streamed.text,
            timeMs: Math.round(performance.now() - start),
            ttfbMs,
            sizeBytes: Buffer.byteLength(streamed.text),
            ...redirectInfo,
            stream: {
              endedBy: streamed.endedBy,
              ...(streamed.error ? { error: streamed.error } : {})
            }
          }
        }

        const buffer = await readBodyCapped(res, MAX_RESPONSE_BYTES)
        const timeMs = Math.round(performance.now() - start)

        const bytes = buffer
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
          ttfbMs: Math.min(ttfbMs, timeMs),
          sizeBytes: buffer.byteLength,
          ...redirectInfo
        }
      } catch (err) {
        const timeMs = Math.round(performance.now() - start)
        if (err instanceof ResponseTooLargeError) {
          return {
            ok: false,
            error: `La respuesta supera los ${MAX_RESPONSE_BYTES / 1024 / 1024} MB y se descartó para no agotar la memoria`,
            timeMs
          }
        }
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
