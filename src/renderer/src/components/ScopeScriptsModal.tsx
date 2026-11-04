import { useState } from 'react'
import type { ScopeScripts } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { Modal } from './Modal'

export interface ScriptsScope {
  collectionId: string
  collectionName: string
  /** Nombre de la carpeta. Sin él, el alcance es toda la colección */
  folder?: string
  scripts?: ScopeScripts
}

const editor =
  'min-h-28 w-full resize-y rounded-md border border-zinc-700 bg-zinc-800 p-2 font-mono text-xs leading-relaxed outline-none placeholder:text-zinc-500 focus:border-blue-500'

/** Edita los scripts que corren en todas las peticiones de una colección o de una carpeta */
export function ScopeScriptsModal({
  scope,
  onClose
}: {
  scope: ScriptsScope
  onClose: () => void
}): React.JSX.Element {
  const isFolder = !!scope.folder
  const [pre, setPre] = useState(scope.scripts?.pre ?? '')
  const [post, setPost] = useState(scope.scripts?.post ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      await window.api.setScopeScripts(
        scope.collectionId,
        scope.folder ?? null,
        pre.trim() || post.trim() ? { pre, post } : null
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
      title={`Scripts de ${isFolder ? `la carpeta «${scope.folder}»` : `«${scope.collectionName}»`}`}
      onClose={onClose}
      wide
    >
      <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
        Corren en todas las peticiones {isFolder ? 'de esta carpeta' : 'de la colección'}, antes del
        script de cada petición. Orden: colección, carpeta y petición. Usan la misma API que los
        scripts de una petición (<code>sonda.env</code>, <code>sonda.request</code>,{' '}
        <code>sonda.response</code>, <code>sonda.test</code>…).
      </p>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-zinc-300">Pre-script</span>
            <span className="text-[11px] text-zinc-500">Antes de enviar</span>
          </span>
          <textarea
            value={pre}
            onChange={(e) => setPre(e.target.value)}
            spellCheck={false}
            className={editor}
            placeholder={"sonda.request.headers['X-Request-Id'] = sonda.uuid()"}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-zinc-300">Post-script</span>
            <span className="text-[11px] text-zinc-500">Al recibir la respuesta</span>
          </span>
          <textarea
            value={post}
            onChange={(e) => setPost(e.target.value)}
            spellCheck={false}
            className={editor}
            placeholder={
              "sonda.test('responde en menos de 2 s', () => sonda.expect(sonda.response.timeMs).toBeLessThan(2000))"
            }
          />
        </label>
      </div>

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
