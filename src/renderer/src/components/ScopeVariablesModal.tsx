import { useState } from 'react'
import type { KeyValueData } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { newRow, type KeyValue } from '../store/useRequestStore'
import { KeyValueEditor } from './KeyValueEditor'
import { Modal } from './Modal'

export interface VariablesScope {
  collectionId: string
  collectionName: string
  variables?: KeyValueData[]
}

/** Edita las variables que comparten todas las peticiones de una colección */
export function ScopeVariablesModal({
  scope,
  onClose
}: {
  scope: VariablesScope
  onClose: () => void
}): React.JSX.Element {
  const [rows, setRows] = useState<KeyValue[]>(() => [
    ...(scope.variables ?? []).map((v) => ({ ...v, id: crypto.randomUUID() })),
    newRow()
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      const variables: KeyValueData[] = rows
        .filter((r) => r.key.trim())
        .map((r) => ({ key: r.key.trim(), value: r.value, enabled: r.enabled }))
      await window.api.setCollectionVariables(
        scope.collectionId,
        variables.length > 0 ? variables : null
      )
      await useCollectionsStore.getState().refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Variables de «${scope.collectionName}»`} onClose={onClose}>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Úsalas como {'{{nombre}}'} en cualquier petición de esta colección. Si el entorno activo
        define una variable con el mismo nombre, el entorno tiene prioridad. Se guardan en el
        archivo de la colección, no se cifran: para secretos usa el entorno.
      </p>

      <KeyValueEditor
        rows={rows}
        onChange={setRows}
        keyPlaceholder="Variable"
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
