import { useState } from 'react'
import { MAX_DESCRIPTION } from '../../../shared/collectionDescription'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { Modal } from './Modal'

export interface DescriptionScope {
  collectionId: string
  collectionName: string
  description?: string
}

/** Edita la descripción (Markdown) de una colección */
export function CollectionDescriptionModal({
  scope,
  onClose
}: {
  scope: DescriptionScope
  onClose: () => void
}): React.JSX.Element {
  const [text, setText] = useState(scope.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      await window.api.setCollectionDescription(scope.collectionId, text.trim() ? text : null)
      await useCollectionsStore.getState().refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Descripción de «${scope.collectionName}»`} onClose={onClose}>
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Explica para qué sirve la colección, qué entorno usar o cómo autenticarse. Acepta Markdown.
        Se guarda en el archivo de la colección y se incluye al exportar la documentación.
      </p>

      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={MAX_DESCRIPTION}
        rows={12}
        placeholder={'Ej: API de pagos.\nUsa el entorno "staging" para pruebas.'}
        className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-800 p-2 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500"
      />
      <p className="mt-1 text-right text-[10px] text-zinc-600">
        {text.length} / {MAX_DESCRIPTION}
      </p>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cancelar
        </button>
        <button onClick={save} disabled={saving} className="btn btn-primary">
          Guardar
        </button>
      </div>
    </Modal>
  )
}
