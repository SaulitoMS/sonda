import { emptyAuth } from '../../../shared/auth'
import { fromBodyFormData } from '../../../shared/bodyForm'
import type { ParsedCurl } from '../../../shared/curl'
import type { AuthConfig } from '../../../shared/types'
import { newRow, useRequestStore } from '../store/useRequestStore'

/** Auth de la petición importada: Digest si el comando traía --digest, vacía si no */
function authFromCurl(parsed: ParsedCurl): AuthConfig {
  if (!parsed.digest || !parsed.user) return emptyAuth()
  const i = parsed.user.indexOf(':')
  const username = i === -1 ? parsed.user : parsed.user.slice(0, i)
  const password = i === -1 ? '' : parsed.user.slice(i + 1)
  return { ...emptyAuth(), type: 'digest', username, password }
}

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
    bodyForm: fromBodyFormData(parsed.bodyForm),
    auth: authFromCurl(parsed),
    currentFile: null,
    name: '',
    response: null,
    responseSchemas: null,
    validation: null,
    warnings: []
  })
}
