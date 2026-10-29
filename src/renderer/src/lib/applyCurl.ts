import type { ParsedCurl } from '../../../shared/curl'
import { newRow, useRequestStore } from '../store/useRequestStore'

/** Carga un cURL parseado como una petición nueva (sin guardar) */
export function applyCurl(parsed: ParsedCurl): void {
  useRequestStore.setState({
    method: parsed.method,
    url: parsed.url,
    headers: [
      ...parsed.headers.map((h) => ({ id: crypto.randomUUID(), ...h, enabled: true })),
      newRow()
    ],
    body: parsed.body,
    currentFile: null,
    name: '',
    response: null,
    responseSchemas: null,
    validation: null
  })
}
