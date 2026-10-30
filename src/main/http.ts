import { dialog, ipcMain } from 'electron'
import { openAsBlob } from 'fs'
import { stat } from 'fs/promises'
import { basename } from 'path'
import type { FormPart, SendRequestInput, SendRequestResult } from '../shared/types'

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

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

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000)

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

        const res = await fetch(url, {
          method: input.method,
          headers,
          body,
          signal: controller.signal,
          redirect: 'follow'
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

  ipcMain.handle('files:pick', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}
