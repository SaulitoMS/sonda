import { useState } from 'react'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useRequestStore } from '../store/useRequestStore'
import { Icon } from './Icon'
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

  const canSave = !!name.trim() && (target !== NEW || !!newName.trim()) && !saving

  const submit = async (): Promise<void> => {
    if (!canSave) return
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

  return (
    <Modal
      title="Guardar petición"
      description="Se guardará en una colección de tu carpeta de trabajo"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost">
            Cancelar
          </button>
          <button onClick={submit} disabled={!canSave} className="btn btn-primary">
            <Icon name="save" size={14} />
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <label className="field-label">Nombre</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
        }}
        spellCheck={false}
        className="field"
      />

      <label className="field-label mt-4">Colección</label>
      <div className="relative">
        <Icon
          name="folderOpen"
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="field appearance-none pl-9 pr-8"
        >
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={NEW}>+ Nueva colección…</option>
        </select>
        <Icon
          name="chevronDown"
          size={13}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
      </div>

      {target === NEW && (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="Nombre de la colección"
          className="field mt-2"
        />
      )}

      {error && (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-400">
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
    </Modal>
  )
}
