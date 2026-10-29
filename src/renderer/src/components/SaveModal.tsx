import { useState } from 'react'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const NEW = '__new__'

interface Props {
  onClose: () => void
  onSaved: () => void
}

export function SaveModal({ onClose, onSaved }: Props): React.JSX.Element {
  const { collections, refresh } = useCollectionsStore()

  const [name, setName] = useState(() => {
    const { method, url } = useRequestStore.getState()
    try {
      return `${method} ${new URL(url).pathname}`
    } catch {
      return 'Nueva petición'
    }
  })
  const [target, setTarget] = useState(collections[0]?.id ?? NEW)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim() || (target === NEW && !newName.trim())) return
    setSaving(true)
    setError('')
    try {
      let collectionId = target
      if (target === NEW) {
        collectionId = (await window.api.createCollection(newName.trim())).id
      }
      const request = useRequestStore.getState().toSaved(name.trim())
      const path = await window.api.saveRequest({ collectionId, request })
      useRequestStore.getState().markSaved(path, name.trim())
      await refresh()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  const inputClass =
    'w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs outline-none focus:border-blue-500'

  return (
    <Modal title="Guardar petición" onClose={onClose}>
      <label className="mb-1 block text-xs text-zinc-400">Nombre</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />

      <label className="mb-1 mt-3 block text-xs text-zinc-400">Colección</label>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass}>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={NEW}>+ Nueva colección…</option>
      </select>

      {target === NEW && (
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nombre de la colección"
          className={`${inputClass} mt-2`}
        />
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </Modal>
  )
}