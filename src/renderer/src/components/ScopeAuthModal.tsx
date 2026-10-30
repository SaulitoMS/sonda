import { useState } from 'react'
import { emptyAuth } from '../../../shared/auth'
import type { AuthConfig } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { AuthForm } from './AuthPanel'
import { Modal } from './Modal'

export interface AuthScope {
  collectionId: string
  collectionName: string
  /** Nombre de la carpeta. Sin él, el alcance es toda la colección */
  folder?: string
  auth?: AuthConfig
}

/** Edita la auth que heredan las peticiones de una colección o de una carpeta */
export function ScopeAuthModal({
  scope,
  onClose
}: {
  scope: AuthScope
  onClose: () => void
}): React.JSX.Element {
  const isFolder = !!scope.folder
  // La colección es la raíz: sin auth propia no hay nada que heredar
  const [auth, setAuth] = useState<AuthConfig>(
    scope.auth ?? { ...emptyAuth(), type: isFolder ? 'inherit' : 'none' }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      await window.api.setScopeAuth(scope.collectionId, scope.folder ?? null, auth)
      await useCollectionsStore.getState().refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Autenticación de ${isFolder ? `la carpeta «${scope.folder}»` : `«${scope.collectionName}»`}`}
      onClose={onClose}
    >
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Las peticiones con tipo <b>Heredar</b> usan esta auth. Una petición puede sobrescribirla o
        elegir «Sin autenticación».
      </p>

      <AuthForm
        value={auth}
        onChange={setAuth}
        inheritLabel={isFolder ? 'Heredar de la colección' : undefined}
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
