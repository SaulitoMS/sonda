import { useEffect, useState } from 'react'
import type { CookieInfo } from '../../../shared/types'
import { Modal } from './Modal'

const expiry = (c: CookieInfo): string =>
  c.expiresAt === null ? 'Sesión' : new Date(c.expiresAt).toLocaleString('es')

export function CookiesModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [cookies, setCookies] = useState<CookieInfo[] | null>(null)

  useEffect(() => {
    let alive = true
    window.api.listCookies().then((list) => {
      if (alive) setCookies(list)
    })
    return () => {
      alive = false
    }
  }, [])

  const remove = async (id: string): Promise<void> => {
    await window.api.deleteCookie(id)
    setCookies(await window.api.listCookies())
  }

  const clearAll = async (): Promise<void> => {
    if (!confirm('¿Borrar todas las cookies?')) return
    await window.api.clearCookies()
    setCookies([])
  }

  return (
    <Modal title="Cookies" onClose={onClose} wide>
      <p className="mb-3 text-xs text-zinc-500">
        Se guardan de las respuestas y se envían solas a su dominio. Viven en memoria: al cerrar
        Sonda se pierden.
      </p>

      <div className="max-h-80 overflow-auto rounded-md border border-zinc-800">
        {cookies === null ? (
          <p className="p-4 text-xs text-zinc-500">Cargando…</p>
        ) : cookies.length === 0 ? (
          <p className="p-4 text-xs text-zinc-500">No hay cookies guardadas.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Dominio</th>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Ruta</th>
                <th className="px-3 py-2 font-medium">Expira</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {cookies.map((c) => (
                <tr key={c.id} className="border-t border-zinc-800">
                  <td className="px-3 py-1.5 text-zinc-300">
                    {c.domain}
                    {c.secure && (
                      <span className="ml-1 text-amber-400" title="Solo se envía por https">
                        🔒
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-zinc-200">{c.name}</td>
                  <td
                    className="max-w-48 truncate px-3 py-1.5 font-mono text-zinc-400"
                    title={c.value}
                  >
                    {c.value}
                  </td>
                  <td className="px-3 py-1.5 text-zinc-400">{c.path}</td>
                  <td className="px-3 py-1.5 text-zinc-400">{expiry(c)}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => remove(c.id)}
                      className="rounded px-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                      title="Borrar cookie"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex justify-between">
        <button
          onClick={clearAll}
          disabled={!cookies?.length}
          className="rounded px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-800 disabled:opacity-40"
        >
          Limpiar todo
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
