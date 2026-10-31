import { useState } from 'react'
import { clampInterval, MAX_INTERVAL_MIN, MIN_INTERVAL_MIN, uptime } from '../../../shared/monitor'
import { safeRequestsOf } from '../lib/monitorRunner'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useMonitorStore } from '../store/useMonitorStore'
import { Modal } from './Modal'

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50'
const label = 'mb-1 block text-xs font-medium text-zinc-400'

interface Props {
  onClose: () => void
}

export function MonitorModal({ onClose }: Props): React.JSX.Element {
  const collections = useCollectionsStore((s) => s.collections)
  const { active, checking, collectionId, intervalMin, nextAt, runs, start, stop, runNow } =
    useMonitorStore()

  const [selected, setSelected] = useState(collectionId ?? collections[0]?.id ?? '')
  const [minutes, setMinutes] = useState(active ? intervalMin : 5)

  const safeCount = selected ? safeRequestsOf(selected).length : 0
  const rate = uptime(runs)

  return (
    <Modal title="Monitor de colección" onClose={onClose} wide>
      <div className="grid grid-cols-[1fr_160px] gap-3">
        <div>
          <label className={label}>Colección</label>
          <select
            value={selected}
            disabled={active}
            onChange={(e) => setSelected(e.target.value)}
            className={field}
          >
            {collections.length === 0 && <option value="">(sin colecciones)</option>}
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Cada (minutos)</label>
          <input
            type="number"
            min={MIN_INTERVAL_MIN}
            max={MAX_INTERVAL_MIN}
            value={minutes}
            disabled={active}
            onChange={(e) => setMinutes(clampInterval(Number(e.target.value)))}
            className={field}
          />
        </div>
      </div>

      <p className="mt-2 text-[11px] text-zinc-500">
        Solo envía peticiones GET, HEAD y OPTIONS ({safeCount} en esta colección), con el entorno
        activo. Funciona mientras Sonda esté abierta, incluso con este modal cerrado, y avisa con
        una notificación cuando algo empieza a fallar o se recupera.
      </p>

      <div className="mt-3 flex items-center gap-4 text-xs">
        <span className={active ? 'text-emerald-400' : 'text-zinc-500'}>
          {active ? '● Monitor activo' : '○ Monitor detenido'}
        </span>
        {checking && <span className="text-zinc-400">Comprobando…</span>}
        {active && !checking && nextAt && (
          <span className="text-zinc-500">
            Próxima comprobación: {new Date(nextAt).toLocaleTimeString()}
          </span>
        )}
        {rate !== null && (
          <span className="ml-auto text-zinc-400">
            Disponibilidad: <b className="text-zinc-200">{rate}%</b> ({runs.length}{' '}
            {runs.length === 1 ? 'comprobación' : 'comprobaciones'})
          </span>
        )}
      </div>

      {runs.length > 0 && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-zinc-800">
          {runs.map((r) => (
            <div
              key={r.at}
              className="border-b border-zinc-800 px-3 py-1.5 text-xs last:border-b-0"
            >
              <div className="flex items-center gap-4">
                <span className="w-20 shrink-0 text-zinc-400">
                  {new Date(r.at).toLocaleTimeString()}
                </span>
                <span className="text-emerald-400">✓ {r.pass}</span>
                <span className="text-amber-400">⚠ {r.warn}</span>
                <span className="text-red-400">✗ {r.fail}</span>
                <span className="ml-auto text-zinc-500">{r.timeMs} ms</span>
              </div>
              {r.failures.map((f) => (
                <p
                  key={f.name}
                  className="truncate pl-24 text-[11px] text-red-300"
                  title={f.detail}
                >
                  {f.name}: {f.detail}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Cerrar
        </button>
        {active ? (
          <>
            <button
              onClick={() => void runNow()}
              disabled={checking}
              className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            >
              Comprobar ahora
            </button>
            <button
              onClick={stop}
              className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
            >
              Detener monitor
            </button>
          </>
        ) : (
          <button
            onClick={() => start(selected, minutes)}
            disabled={!selected || safeCount === 0}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Iniciar monitor
          </button>
        )}
      </div>
    </Modal>
  )
}
