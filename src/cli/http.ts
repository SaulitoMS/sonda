import { openAsBlob } from 'fs'
import { stat } from 'fs/promises'
import { basename } from 'path'
import { Agent, ProxyAgent, type Dispatcher } from 'undici'
import { sendFollowingRedirects } from '../shared/redirects'
import { collectEventStream, isEventStream } from '../shared/sse'
import type { FormPart, SendRequestInput, SendRequestResult } from '../shared/types'

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024
const MAX_STREAM_BYTES = 20 * 1024 * 1024

export interface SenderOptions {
  timeoutMs: number
  followRedirects: boolean
  /** true = no verifica TLS · false = siempre verifica · null = solo tolera localhost */
  insecure: boolean | null
  proxyUrl: string
}

const isLoopbackHost = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname === '[::1]' ||
  /^127(\.\d{1,3}){3}$/.test(hostname)

class ResponseTooLargeError extends Error {}

async function readBodyCapped(res: Response, max: number): Promise<Uint8Array> {
  if (Number(res.headers.get('content-length')) > max) {
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
  return Buffer.concat(chunks)
}

/** Un archivo (no texto) se reconoce por su Content-Type y, si no basta, por un byte NUL al inicio */
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
  return bytes.subarray(0, 1024).includes(0)
}

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

/**
 * Equivalente en Node del handler `http:send` de la app: mismas redirecciones manuales, mismos
 * límites y mismo formato de respuesta. Sin Electron, sin cookie jar y sin vista en vivo de streams.
 */
export function createSender(
  options: SenderOptions
): (input: SendRequestInput) => Promise<SendRequestResult> {
  const dispatchers = new Map<string, Dispatcher>()

  const dispatcherFor = (proxyUrl: string, ignoreTls: boolean): Dispatcher => {
    const key = `${proxyUrl}|${ignoreTls}`
    let d = dispatchers.get(key)
    if (!d) {
      d = proxyUrl
        ? new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: !ignoreTls } })
        : new Agent({ connect: { rejectUnauthorized: !ignoreTls } })
      dispatchers.set(key, d)
    }
    return d
  }

  const connectionFor = (target: URL): { dispatcher?: Dispatcher } => {
    const loopback = isLoopbackHost(target.hostname)
    const insecure = options.insecure ?? loopback
    const ignoreTls = insecure && target.protocol === 'https:'
    const proxyUrl = options.proxyUrl && !loopback ? options.proxyUrl : ''
    return ignoreTls || proxyUrl ? { dispatcher: dispatcherFor(proxyUrl, ignoreTls) } : {}
  }

  return async (input) => {
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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? options.timeoutMs)

    try {
      const headers = new Headers()
      for (const h of input.headers) {
        if (h.key.trim()) headers.append(h.key.trim(), h.value)
      }

      const canHaveBody = !['GET', 'HEAD'].includes(input.method)
      let body: string | FormData | undefined
      if (canHaveBody && input.formData) {
        body = await buildFormData(input.formData)
        headers.delete('content-type') // fetch pone el suyo, con el boundary
      } else if (canHaveBody && input.body) {
        body = input.body
      }

      const {
        res,
        url: finalUrl,
        hops
      } = await sendFollowingRedirects({
        url,
        method: input.method,
        headers,
        body,
        follow: input.followRedirects ?? options.followRedirects,
        send: (target, init) =>
          fetch(target, {
            ...init,
            signal: controller.signal,
            redirect: 'manual',
            ...connectionFor(target)
          } as RequestInit)
      })
      const redirectInfo = hops.length > 0 ? { redirects: hops, finalUrl: finalUrl.href } : {}
      const ttfbMs = Math.round(performance.now() - start)

      const resHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        resHeaders[key] = value
      })
      const contentType = res.headers.get('content-type') ?? ''

      // Un stream SSE no termina solo: se lee hasta que el servidor lo cierre o venza el tiempo
      if (isEventStream(contentType)) {
        const streamed = await collectEventStream(res, {
          max: MAX_STREAM_BYTES,
          wasCancelled: () => false
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

      const bytes = await readBodyCapped(res, MAX_RESPONSE_BYTES)
      const timeMs = Math.round(performance.now() - start)
      const binary = isBinaryResponse(contentType, bytes)

      return {
        ok: true,
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: binary ? '' : new TextDecoder('utf-8').decode(bytes),
        // En CI no se necesita el contenido de un archivo, solo saber que lo es
        ...(binary
          ? {
              binary: {
                contentType:
                  contentType.split(';')[0].trim().toLowerCase() || 'application/octet-stream',
                base64: '',
                truncated: true
              }
            }
          : {}),
        timeMs,
        ttfbMs: Math.min(ttfbMs, timeMs),
        sizeBytes: bytes.byteLength,
        ...redirectInfo
      }
    } catch (err) {
      const timeMs = Math.round(performance.now() - start)
      if (err instanceof ResponseTooLargeError) {
        return {
          ok: false,
          error: `La respuesta supera los ${MAX_RESPONSE_BYTES / 1024 / 1024} MB y se descartó`,
          timeMs
        }
      }
      if (err instanceof Error && err.name === 'AbortError') {
        return { ok: false, error: 'La petición excedió el tiempo límite', timeMs }
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
    }
  }
}
