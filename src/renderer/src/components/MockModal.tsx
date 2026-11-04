import { useEffect, useState } from 'react'
import { CHAOS_STATUSES, MAX_CHAOS_DELAY_MS, type MockChaos } from '../../../shared/mockChaos'
import type { MockLogEntry, MockStatus } from '../../../shared/types'
import { METHOD_COLORS } from '../lib/methodColors'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { Modal } from './Modal'

const field =
  'rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

/** Resumen legible del caos activo, o '' si no hay */
function describeChaos(c: MockChaos | undefined): string {
  if (!c) return ''
  const parts: string[] = []
  if (c.delayMs > 0 || c.jitterMs > 0) {
    parts.push(`latencia ${c.delayMs} ms${c.jitterMs > 0 ? ` (+0–${c.jitterMs} ms)` : ''}`)
  }
  if (c.errorRate > 0) parts.push(`${c.errorRate} % de respuestas con ${c.errorStatus}`)
  return parts.join(' · ')
}

export function MockModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const collections = useCollectionsStore((s) => s.collections)
  const [pickedId, setPickedId] = useState('')
  const [port, setPort] = useState('4010')
  const [delay, setDelay] = useState('0')
  const [jitter, setJitter] = useState('0')
  const [errorRate, setErrorRate] = useState('0')
  const [errorStatus, setErrorStatus] = useState('500')
  const [status, setStatus] = useState<MockStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [log, setLog] = useState<MockLogEntry[]>([])
  const [openId, setOpenId] = useState<number | null>(null)

  // Si ya hay un mock corriendo (se cerró la ventana y se volvió a abrir), se muestra tal cual
  useEffect(() => {
    let alive = true
    window.api.getMockStatus().then((s) => {
      if (!alive) return
      setStatus(s)
      if (s.running) {
        setPickedId(s.collectionId)
        setPort(String(s.port))
        if (s.chaos) {
          setDelay(String(s.chaos.delayMs))
          setJitter(String(s.chaos.jitterMs))
          setErrorRate(String(s.chaos.errorRate))
          setErrorStatus(String(s.chaos.errorStatus))
        }
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const collectionId = pickedId || collections[0]?.id || ''
  const live = status && status.running ? status : null

  // Mientras el mock corre, se refresca el registro de peticiones cada segundo
  const isLive = !!live
  useEffect(() => {
    if (!isLive) return
    let alive = true
    const tick = (): void => {
      window.api.getMockLog().then((entries) => {
        if (alive) setLog(entries)
      })
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [isLive])

  const currentChaos = (): MockChaos => ({
    delayMs: Number(delay) || 0,
    jitterMs: Number(jitter) || 0,
    errorRate: Number(errorRate) || 0,
    errorStatus: Number(errorStatus) || 500
  })

  const start = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const chaos = currentChaos()
      const result = await window.api.startMock(collectionId, Number(port), chaos)
      if (result.ok) {
        setStatus({ running: true, collectionId, port: result.port, routes: result.routes, chaos })
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

  const chaosSummary = describeChaos(live?.chaos)

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

      <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
        <p className="mb-2 text-xs font-medium text-zinc-300">Simular una API inestable</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label>
            <span className={label}>Latencia (ms)</span>
            <input
              className={`${field} w-full`}
              inputMode="numeric"
              value={delay}
              disabled={!!live || busy}
              onChange={(e) => setDelay(e.target.value)}
              title={`Máximo ${MAX_CHAOS_DELAY_MS} ms`}
            />
          </label>
          <label>
            <span className={label}>Variación (ms)</span>
            <input
              className={`${field} w-full`}
              inputMode="numeric"
              value={jitter}
              disabled={!!live || busy}
              onChange={(e) => setJitter(e.target.value)}
            />
          </label>
          <label>
            <span className={label}>% con error</span>
            <input
              className={`${field} w-full`}
              inputMode="numeric"
              value={errorRate}
              disabled={!!live || busy}
              onChange={(e) => setErrorRate(e.target.value)}
            />
          </label>
          <label>
            <span className={label}>Status del error</span>
            <select
              className={`${field} w-full`}
              value={errorStatus}
              disabled={!!live || busy}
              onChange={(e) => setErrorStatus(e.target.value)}
            >
              {CHAOS_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Las respuestas con error llevan el header <code>x-sonda-chaos: error</code>. Un 429
          incluye <code>Retry-After</code>. Para cambiar estos valores, detén y vuelve a iniciar el
          mock.
        </p>
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
          {chaosSummary && <p className="mb-1 text-xs text-amber-400">Simulando: {chaosSummary}</p>}
          <p className="mb-1 text-xs text-zinc-500">
            Pon esa URL en la variable <code>baseUrl</code> de tu entorno para probarlo desde Sonda.
          </p>
          <p className="mb-2 text-xs text-zinc-500">
            Para ver otra respuesta de la spec, agrega el header <code>x-sonda-status: 404</code> a
            la petición (acepta el status exacto, un rango como <code>4XX</code> o{' '}
            <code>default</code>).
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

      {live && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-300">Peticiones recibidas ({log.length})</p>
            <button
              onClick={async () => {
                await window.api.clearMockLog()
                setLog([])
              }}
              className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Limpiar
            </button>
          </div>
          <div className="max-h-64 overflow-auto rounded-md border border-zinc-800">
            {log.length === 0 ? (
              <p className="px-3 py-3 text-xs text-zinc-500">Aún no ha llegado ninguna petición.</p>
            ) : (
              [...log].reverse().map((e) => (
                <div key={e.id} className="border-t border-zinc-800 first:border-t-0">
                  <button
                    onClick={() => setOpenId(openId === e.id ? null : e.id)}
                    className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-xs hover:bg-zinc-900"
                  >
                    <span
                      className={`w-14 shrink-0 font-mono font-semibold ${(METHOD_COLORS as Record<string, string>)[e.method] ?? 'text-zinc-300'}`}
                    >
                      {e.method}
                    </span>
                    <span className="flex-1 truncate font-mono text-zinc-300">{e.url}</span>
                    <span className={e.matched ? 'text-zinc-400' : 'text-amber-400'}>
                      {e.status}
                    </span>
                    <span className="w-14 shrink-0 text-right text-zinc-500">{e.timeMs} ms</span>
                  </button>
                  {openId === e.id && (
                    <div className="space-y-2 bg-zinc-950 px-3 py-2">
                      {!e.matched && (
                        <p className="text-[11px] text-amber-400">
                          Ninguna ruta de la colección coincide con esta petición.
                        </p>
                      )}
                      <pre className="overflow-auto text-[11px] text-zinc-400">
                        {Object.entries(e.headers)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join('\n')}
                      </pre>
                      {e.body && (
                        <pre className="max-h-40 overflow-auto border-t border-zinc-800 pt-2 text-[11px] text-zinc-300">
                          {e.body}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
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
