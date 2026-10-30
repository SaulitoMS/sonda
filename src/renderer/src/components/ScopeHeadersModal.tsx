import { useState } from 'react'
import type { KeyValueData } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { newRow, type KeyValue } from '../store/useRequestStore'
import { KeyValueEditor } from './KeyValueEditor'
import { Modal } from './Modal'

export interface HeadersScope {
  collectionId: string
  collectionName: string
  /** Nombre de la carpeta. Sin él, el alcance es toda la colección */
  folder?: string
  headers?: KeyValueData[]
}

/** Edita los headers que heredan las peticiones de una colección o de una carpeta */
export function ScopeHeadersModal({
  scope,
  onClose
}: {
  scope: HeadersScope
  onClose: () => void
}): React.JSX.Element {
  const isFolder = !!scope.folder
  const [rows, setRows] = useState<KeyValue[]>(() => [
    ...(scope.headers ?? []).map((h) => ({ ...h, id: crypto.randomUUID() })),
    newRow()
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      const headers: KeyValueData[] = rows
        .filter((r) => r.key.trim())
        .map((r) => ({ key: r.key.trim(), value: r.value, enabled: r.enabled }))
      await window.api.setScopeHeaders(
        scope.collectionId,
        scope.folder ?? null,
        headers.length > 0 ? headers : null
      )
      await useCollectionsStore.getState().refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Headers de ${isFolder ? `la carpeta «${scope.folder}»` : `«${scope.collectionName}»`}`}
      onClose={onClose}
    >
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Se agregan a todas las peticiones {isFolder ? 'de esta carpeta' : 'de la colección'}.
        {isFolder
          ? ' Los de la carpeta pisan a los de la colección, y los de cada petición pisan a ambos.'
          : ' Los de una carpeta o de una petición con la misma clave los sobrescriben.'}{' '}
        Puedes usar {'{{variables}}'}.
      </p>

      <KeyValueEditor
        rows={rows}
        onChange={setRows}
        keyPlaceholder="Header"
        valuePlaceholder="Valor"
      />

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cancelar
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </Modal>
  )
}
