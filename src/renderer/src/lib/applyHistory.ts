import { emptyAuth } from '../../../shared/auth'
import { fromBodyFormData } from '../../../shared/bodyForm'
import type { HistoryEntry } from '../../../shared/history'
import { newRow, useRequestStore } from '../store/useRequestStore'


export function applyHistory(entry: HistoryEntry): void {
  useRequestStore.setState({
    method: entry.method,
    url: entry.url,
    headers: [...entry.headers.map((h) => ({ id: crypto.randomUUID(), ...h })), newRow()],
    body: entry.body,
    bodyForm: fromBodyFormData(entry.bodyForm),
    auth: { ...emptyAuth(), ...entry.auth },
    // El historial no guarda reglas, scripts ni schemas: se parte de una petición limpia
    assertions: [],
    extractions: [],
    preScript: '',
    postScript: '',
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