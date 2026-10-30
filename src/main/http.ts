import { ipcMain } from 'electron'
import type { SendRequestInput, SendRequestResult } from '../shared/types'
import { Agent } from 'undici'

// Un solo agente reutilizable para peticiones con SSL relajado
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } })

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

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000)

      try {
        const headers = new Headers()
        for (const h of input.headers) {
          if (h.key.trim()) headers.append(h.key.trim(), h.value)
        }

        const canHaveBody = !['GET', 'HEAD'].includes(input.method)
        const res = await fetch(url, {
          method: input.method,
          headers,
          body: canHaveBody && input.body ? input.body : undefined,
          signal: controller.signal,
          redirect: input.followRedirects === false ? 'manual' : 'follow',
          // `dispatcher` es de undici y no está en los tipos de fetch
          ...(input.insecure ? ({ dispatcher: insecureAgent } as object) : {})
        })

        const buffer = await res.arrayBuffer()
        const timeMs = Math.round(performance.now() - start)

        const resHeaders: Record<string, string> = {}
        res.headers.forEach((value, key) => {
          resHeaders[key] = value
        })

        return {
          ok: true,
          status: res.status,
          statusText: res.statusText,
          headers: resHeaders,
          body: new TextDecoder('utf-8').decode(buffer),
          timeMs,
          sizeBytes: buffer.byteLength
        }
      } catch (err) {
        const timeMs = Math.round(performance.now() - start)
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
  )
}
