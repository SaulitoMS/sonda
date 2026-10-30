import { emptyAuth } from '../../../shared/auth'
import type { HistoryEntry } from '../../../shared/history'
import { newRow, useRequestStore } from '../store/useRequestStore'

/** Carga una entrada del historial como petición nueva (sin guardar), junto con su respuesta */
export function applyHistory(entry: HistoryEntry): void {
  useRequestStore.setState({
    method: entry.method,
    url: entry.url,
    headers: [...entry.headers.map((h) => ({ id: crypto.randomUUID(), ...h })), newRow()],
    body: entry.body,
    auth: { ...emptyAuth(), ...entry.auth },
    // El historial no guarda reglas ni schemas: se parte de una petición limpia
    assertions: [],
    extractions: [],
    requestSchema: null,
    responseSchemas: null,
    validation: null,
    assertionResults: [],
    extractionResults: [],
    warnings: [],
    currentFile: null,
    name: '',
    response: entry.response
  })
}