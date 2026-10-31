import { useEffect, useState } from 'react'
import type { MockStatus } from '../../../shared/types'
import { METHOD_COLORS } from '../lib/methodColors'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { Modal } from './Modal'

const field =
  'rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

export function MockModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const collections = useCollectionsStore((s) => s.collections)
  const [pickedId, setPickedId] = useState('')
  const [port, setPort] = useState('4010')
  const [status, setStatus] = useState<MockStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // Si ya hay un mock corriendo (se cerró la ventana y se volvió a abrir), se muestra tal cual
  useEffect(() => {
    let alive = true
    window.api.getMockStatus().then((s) => {
      if (!alive) return
      setStatus(s)
      if (s.running) {
        setPickedId(s.collectionId)
        setPort(String(s.port))
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const collectionId = pickedId || collections[0]?.id || ''
  const live = status && status.running ? status : null

  const start = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await window.api.startMock(collectionId, Number(port))
      if (result.ok) {
        setStatus({ running: true, collectionId, port: result.port, routes: result.routes })
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar el mock')
    } finally {
      setBusy(false)
    }
  }

  const stop = async (): Promise<void> => {
    setBusy(true)
    await window.api.stopMock()
    setStatus({ running: false })
    setBusy(false)
  }

  const copyUrl = async (): Promise<void> => {
    if (!live) return
    await navigator.clipboard.writeText(`http://127.0.0.1:${live.port}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal title="Servidor mock" onClose={onClose} wide>
      <p className="mb-3 text-xs text-zinc-500">
        Levanta un servidor local que responde con datos de ejemplo generados desde los schemas de
        respuesta de la colección. Sirve para desarrollar un frontend sin que el backend exista.
        Solo es accesible desde tu computadora y sigue activo aunque cierres esta ventana.
      </p>

      <div className="flex items-end gap-3">
        <label className="flex-1">
          <span className={label}>Colección</span>
          <select
            className={`${field} w-full`}
            value={collectionId}
            disabled={!!live || busy}
            onChange={(e) => setPickedId(e.target.value)}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="w-24">
          <span className={label}>Puerto</span>
          <input
            className={`${field} w-full`}
            inputMode="numeric"
            value={port}
            disabled={!!live || busy}
            onChange={(e) => setPort(e.target.value)}
          />
        </label>
        {live ? (
          <button
            onClick={stop}
            disabled={busy}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            Detener
          </button>
        ) : (
          <button
            onClick={start}
            disabled={busy || !collectionId}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Iniciar
          </button>
        )}
      </div>

      {collections.length === 0 && (
        <p className="mt-2 text-xs text-zinc-500">Aún no tienes colecciones. Importa una spec.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {live && (
        <div className="mt-4">
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-zinc-300">Escuchando en</span>
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">
              http://127.0.0.1:{live.port}
            </code>
            <button
              onClick={copyUrl}
              className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              {copied ? 'Copiado ✓' : 'Copiar'}
            </button>
          </div>
          <p className="mb-2 text-xs text-zinc-500">
            Pon esa URL en la variable <code>baseUrl</code> de tu entorno para probarlo desde Sonda.
          </p>

          <div className="max-h-64 overflow-auto rounded-md border border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Método</th>
                  <th className="px-3 py-2 font-medium">Ruta</th>
                  <th className="px-3 py-2 font-medium">Responde</th>
                </tr>
              </thead>
              <tbody>
                {live.routes.map((r) => (
                  <tr key={`${r.method} ${r.path}`} className="border-t border-zinc-800">
                    <td
                      className={`px-3 py-1.5 font-mono font-semibold ${METHOD_COLORS[r.method]}`}
                    >
                      {r.method}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-zinc-300">{r.path}</td>
                    <td className="px-3 py-1.5 text-zinc-400">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
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
