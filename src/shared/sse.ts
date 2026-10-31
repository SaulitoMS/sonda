import type { StreamEnd } from './types'

export interface SseEvent {
  event?: string
  id?: string
  data: string
  retry?: number
}

/** ¿El Content-Type es un stream de Server-Sent Events? */
export const isEventStream = (contentType: string | undefined): boolean =>
  /^\s*text\/event-stream/i.test(contentType ?? '')

/**
 * Separa un text/event-stream en eventos (formato del estándar SSE).
 * Los comentarios (": keep-alive") se ignoran. Un último evento sin línea en blanco final
 * (el stream se cortó a medias) también se incluye.
 */
export function parseSse(text: string): SseEvent[] {
  const events: SseEvent[] = []
  let current: { event?: string; id?: string; retry?: number; data: string[] } = { data: [] }
  let touched = false

  const flush = (): void => {
    if (touched) {
      events.push({
        ...(current.event !== undefined ? { event: current.event } : {}),
        ...(current.id !== undefined ? { id: current.id } : {}),
        ...(current.retry !== undefined ? { retry: current.retry } : {}),
        data: current.data.join('\n')
      })
    }
    current = { data: [] }
    touched = false
  }

  for (const line of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
    if (line === '') {
      flush()
      continue
    }
    if (line.startsWith(':')) continue

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') {
      current.event = value
      touched = true
    } else if (field === 'data') {
      current.data.push(value)
      touched = true
    } else if (field === 'id') {
      current.id = value
      touched = true
    } else if (field === 'retry' && /^\d+$/.test(value)) {
      current.retry = Number(value)
      touched = true
    }
  }
  flush()
  return events
}

export interface CollectOptions {
  /** Tope de bytes; al superarlo se corta y se devuelve lo recibido */
  max: number
  /** Se llama con cada trozo de texto apenas llega */
  onText?: (chunk: string) => void
  /** Para distinguir "el usuario canceló" de "se acabó el tiempo" cuando la petición se aborta */
  wasCancelled: () => boolean
}

/**
 * Lee un text/event-stream hasta que termine y devuelve todo lo recibido.
 * Nunca lanza: si el stream se corta (cancelación, tiempo límite, red caída) conserva lo que llegó.
 */
export async function collectEventStream(
  res: Response,
  { max, onText, wasCancelled }: CollectOptions
): Promise<{ text: string; endedBy: StreamEnd; error?: string }> {
  let text = ''
  if (!res.body) return { text, endedBy: 'closed' }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0

  const push = (chunk: string): void => {
    if (!chunk) return
    text += chunk
    onText?.(chunk)
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      push(decoder.decode(value, { stream: true }))
      if (bytes > max) {
        await reader.cancel()
        return { text, endedBy: 'limit' }
      }
    }
    push(decoder.decode())
    return { text, endedBy: 'closed' }
  } catch (err) {
    push(decoder.decode())
    if (err instanceof Error && err.name === 'AbortError') {
      return { text, endedBy: wasCancelled() ? 'cancelled' : 'timeout' }
    }
    const cause =
      err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : ''
    return {
      text,
      endedBy: 'error',
      error: (err instanceof Error ? err.message : 'Error desconocido') + cause
    }
  }
}
