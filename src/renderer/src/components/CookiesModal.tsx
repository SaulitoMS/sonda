import { useEffect, useState } from 'react'
import type { CookieInfo } from '../../../shared/types'
import { buildVarMap, interpolate } from '../../../shared/variables'
import { useEffectiveEnv } from '../lib/collectionVariables'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

const expiry = (c: CookieInfo): string =>
  c.expiresAt === null ? 'Sesión' : new Date(c.expiresAt).toLocaleString('es')

const DAY_MS = 24 * 60 * 60 * 1000

/** Valor para <input type="datetime-local"> en hora local */
const toLocalInput = (ms: number): string =>
  new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)

/** Expiración por defecto de una cookie nueva: dentro de un día. Fuera del componente por pureza */
const defaultExpires = (): string => toLocalInput(Date.now() + DAY_MS)

/** Host de una URL ya con variables resueltas; '' si no es una URL válida */
function hostOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return /^[a-z0-9.-]+$/.test(host) ? host : ''
  } catch {
    return ''
  }
}

interface Draft {
  replaceId?: string
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  session: boolean
  expires: string
}

export function CookiesModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [cookies, setCookies] = useState<CookieInfo[] | null>(null)
  const [form, setForm] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  // El dominio de la petición abierta sirve para rellenar el formulario
  const url = useRequestStore((s) => s.url)
  const env = useEffectiveEnv()
  const currentHost = hostOf(interpolate(url, buildVarMap(env), { dynamic: false }).text)

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

  const openNew = (): void => {
    setError('')
    setForm({
      name: '',
      value: '',
      domain: currentHost,
      path: '/',
      secure: false,
      session: true,
      expires: defaultExpires()
    })
  }

  const openEdit = (c: CookieInfo): void => {
    setError('')
    setForm({
      replaceId: c.id,
      name: c.name,
      value: c.value,
      domain: (c.hostOnly ? '' : '.') + c.domain,
      path: c.path,
      secure: c.secure,
      session: c.expiresAt === null,
      expires: c.expiresAt === null ? defaultExpires() : toLocalInput(c.expiresAt)
    })
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  const save = async (): Promise<void> => {
    if (!form) return
    const expiresAt = form.session ? null : new Date(form.expires).getTime()
    if (expiresAt !== null && Number.isNaN(expiresAt)) {
      setError('Fecha de expiración inválida')
      return
    }
    const err = await window.api.setCookie({
      name: form.name,
      value: form.value,
      domain: form.domain,
      path: form.path,
      secure: form.secure,
      expiresAt,
      replaceId: form.replaceId
    })
    if (err) {
      setError(err)
      return
    }
    setForm(null)
    setError('')
    setCookies(await window.api.listCookies())
  }

  return (
    <Modal title="Cookies" onClose={onClose} wide>
      <p className="mb-3 text-xs text-zinc-500">
        Se guardan de las respuestas y se envían solas a su dominio. Las de sesión se pierden al
        cerrar Sonda; las que tienen fecha de expiración se guardan cifradas. También puedes
        crearlas o editarlas a mano.
      </p>

      <div className="max-h-72 overflow-auto rounded-md border border-zinc-800">
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
                    {c.hostOnly ? '' : '.'}
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
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded px-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                      title="Editar cookie"
                    >
                      ✎
                    </button>
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

      {form && (
        <div className="mt-3 rounded-md border border-zinc-800 p-3">
          <p className="mb-2 text-xs font-semibold text-zinc-300">
            {form.replaceId ? 'Editar cookie' : 'Nueva cookie'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Nombre</label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="sessionid"
                spellCheck={false}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Valor</label>
              <input
                value={form.value}
                onChange={(e) => set('value', e.target.value)}
                placeholder="abc123"
                spellCheck={false}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Dominio</label>
              <input
                value={form.domain}
                onChange={(e) => set('domain', e.target.value)}
                placeholder="api.ejemplo.com"
                spellCheck={false}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Ruta</label>
              <input
                value={form.path}
                onChange={(e) => set('path', e.target.value)}
                placeholder="/"
                spellCheck={false}
                className={field}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-300">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.secure}
                onChange={(e) => set('secure', e.target.checked)}
              />
              Secure (solo https)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.session}
                onChange={(e) => set('session', e.target.checked)}
              />
              Cookie de sesión
            </label>
            <input
              type="datetime-local"
              value={form.expires}
              disabled={form.session}
              onChange={(e) => set('expires', e.target.value)}
              className={`${field} w-auto`}
            />
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            Con punto inicial (.ejemplo.com) la cookie también se envía a los subdominios.
          </p>

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => {
                setForm(null)
                setError('')
              }}
              className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              onClick={() => void save()}
              className="btn btn-primary btn-sm"
            >
              Guardar cookie
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-between">
        <div className="flex gap-2">
          <button
            onClick={openNew}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            + Agregar cookie
          </button>
          <button
            onClick={clearAll}
            disabled={!cookies?.length}
            className="rounded px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-800 disabled:opacity-40"
          >
            Limpiar todo
          </button>
        </div>
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
