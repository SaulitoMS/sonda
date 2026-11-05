import { useEffect, useState } from 'react'
import type { TrashItem } from '../../../shared/types'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { Modal } from './Modal'

export function TrashModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [items, setItems] = useState<TrashItem[] | null>(null)
  const [error, setError] = useState('')
  const refreshCollections = useCollectionsStore((s) => s.refresh)

  useEffect(() => {
    let alive = true
    window.api.listTrash().then((list) => {
      if (alive) setItems(list)
    })
    return () => {
      alive = false
    }
  }, [])

  const restore = async (item: TrashItem): Promise<void> => {
    setError('')
    try {
      await window.api.restoreFromTrash(item.id)
      await refreshCollections()
      setItems(await window.api.listTrash())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo restaurar')
    }
  }

  const empty = async (): Promise<void> => {
    if (!confirm('¿Vaciar la papelera? Esto no se puede deshacer.')) return
    await window.api.emptyTrash()
    setItems([])
  }

  return (
    <Modal title="Papelera" onClose={onClose} wide>
      <p className="mb-3 text-xs text-zinc-500">
        Lo que eliminas de las colecciones se guarda aquí 30 días antes de borrarse de verdad.
      </p>

      <div className="max-h-72 overflow-auto rounded-md border border-zinc-800">
        {items === null ? (
          <p className="p-4 text-xs text-zinc-500">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-xs text-zinc-500">La papelera está vacía.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Ruta original</th>
                <th className="px-3 py-2 font-medium">Eliminado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-zinc-800">
                  <td className="px-3 py-1.5 text-zinc-200">{item.name}</td>
                  <td className="px-3 py-1.5 text-zinc-400">
                    {item.kind === 'collection' ? 'Colección' : 'Petición'}
                  </td>
                  <td
                    className="max-w-48 truncate px-3 py-1.5 font-mono text-zinc-500"
                    title={item.originalPath}
                  >
                    {item.originalPath}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-400">
                    {new Date(item.deletedAt).toLocaleString('es')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button
                      onClick={() => void restore(item)}
                      className="rounded bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700"
                    >
                      Restaurar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      <div className="mt-4 flex justify-between">
        <button
          onClick={() => void empty()}
          disabled={!items?.length}
          className="rounded px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-800 disabled:opacity-40"
        >
          Vaciar papelera
        </button>
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
