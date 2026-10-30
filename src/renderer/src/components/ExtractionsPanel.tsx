import { emptyExtraction, SOURCE_LABELS } from '../../../shared/extract'
import type { Extraction, ExtractionSource } from '../../../shared/types'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'

const SOURCES = Object.keys(SOURCE_LABELS) as ExtractionSource[]

const selectClass =
  'rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500'

const inputClass =
  'min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500'

const pathPlaceholder: Record<ExtractionSource, string> = {
  body: 'data.token',
  header: 'location'
}

export function ExtractionsPanel(): React.JSX.Element {
  const extractions = useRequestStore((s) => s.extractions)
  const setExtractions = useRequestStore((s) => s.setExtractions)
  const hasEnv = useEnvironmentStore((s) => s.data.activeId !== null)

  const patch = (e: Extraction, p: Partial<Extraction>): void =>
    setExtractions(extractions.map((x) => (x.id === e.id ? { ...e, ...p } : x)))
  const remove = (id: string): void => setExtractions(extractions.filter((x) => x.id !== id))

  return (
    <div className="flex flex-col gap-3">
      {extractions.length === 0 && (
        <p className="text-xs text-zinc-500">
          Guarda un valor de la respuesta en una variable del entorno para usarlo en las siguientes
          peticiones. Ejemplo: en el login extrae <span className="font-mono">token</span> y luego
          usa <span className="font-mono">{'{{token}}'}</span> en la pestaña Auth.
        </p>
      )}

      {extractions.length > 0 && !hasEnv && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
          ⚠ No hay un entorno activo: los valores no se podrán guardar. Selecciona o crea uno en la
          cabecera.
        </p>
      )}

      {extractions.map((e) => (
        <div key={e.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={e.enabled}
            onChange={(ev) => patch(e, { enabled: ev.target.checked })}
            className="accent-blue-500"
            title="Activar o desactivar"
          />

          <select
            value={e.source}
            onChange={(ev) => patch(e, { source: ev.target.value as ExtractionSource, path: '' })}
            className={selectClass}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>

          <input
            value={e.path}
            onChange={(ev) => patch(e, { path: ev.target.value })}
            placeholder={pathPlaceholder[e.source]}
            spellCheck={false}
            className={inputClass}
          />

          <span className="text-zinc-500">→</span>

          <input
            value={e.variable}
            onChange={(ev) => patch(e, { variable: ev.target.value })}
            placeholder="variable"
            spellCheck={false}
            className={inputClass}
          />

          <label
            className="flex items-center gap-1 text-[11px] text-zinc-400"
            title="Si la variable aún no existe, se crea cifrada en el keychain. Úsalo para tokens y contraseñas"
          >
            <input
              type="checkbox"
              checked={e.secret}
              onChange={(ev) => patch(e, { secret: ev.target.checked })}
              className="accent-blue-500"
            />
            Secreto
          </label>

          <button
            onClick={() => remove(e.id)}
            className="px-2 text-zinc-500 hover:text-red-400"
            title="Eliminar"
          >
            ✕
          </button>
        </div>
      ))}

      <div>
        <button
          onClick={() => setExtractions([...extractions, emptyExtraction()])}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          + Agregar extracción
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        En Body escribe la ruta dentro del JSON, por ejemplo{' '}
        <span className="font-mono text-zinc-400">data.token</span> o{' '}
        <span className="font-mono text-zinc-400">items[0].id</span> (vacía = body completo). Los
        valores se guardan en el entorno activo cada vez que llega la respuesta, también al ejecutar
        la colección. Los que no sean secretos se escriben en{' '}
        <span className="font-mono text-zinc-400">environments.json</span> dentro del workspace:
        marca Secreto en tokens y contraseñas.
      </p>
    </div>
  )
}