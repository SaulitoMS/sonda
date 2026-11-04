import { useEffect, useState } from 'react'
import { MAX_TIMEOUT_SECONDS, cleanOverrides, hasOverrides } from '../../../shared/requestOverrides'
import { useRequestStore } from '../store/useRequestStore'

interface Globals {
  timeoutSeconds: number
  followRedirects: boolean
}

export function OverridesPanel(): React.JSX.Element {
  const overrides = useRequestStore((s) => s.overrides)
  const setOverrides = useRequestStore((s) => s.setOverrides)
  const [globals, setGlobals] = useState<Globals | null>(null)

  useEffect(() => {
    void window.api
      .loadSettings()
      .then((s) =>
        setGlobals({ timeoutSeconds: s.timeoutSeconds, followRedirects: s.followRedirects })
      )
  }, [])

  const onTimeout = (raw: string): void => {
    const next = { ...overrides }
    if (raw === '') delete next.timeoutSeconds
    else next.timeoutSeconds = Number(raw)
    setOverrides(cleanOverrides(next))
  }

  const onRedirects = (value: string): void => {
    const next = { ...overrides }
    if (value === 'default') delete next.followRedirects
    else next.followRedirects = value === 'follow'
    setOverrides(cleanOverrides(next))
  }

  const redirectValue =
    overrides.followRedirects === undefined
      ? 'default'
      : overrides.followRedirects
        ? 'follow'
        : 'manual'

  const field = 'rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200'

  return (
    <div className="max-w-md space-y-4 text-xs text-zinc-300">
      <p className="text-zinc-500">
        Solo afectan a esta petición. Lo que dejes vacío usa los ajustes globales.
      </p>

      <label className="flex items-center justify-between gap-3">
        <span>
          Tiempo límite (segundos)
          <span className="block text-[11px] text-zinc-500">
            Global: {globals ? `${globals.timeoutSeconds} s` : '…'}
          </span>
        </span>
        <input
          type="number"
          min={1}
          max={MAX_TIMEOUT_SECONDS}
          value={overrides.timeoutSeconds ?? ''}
          placeholder={globals ? String(globals.timeoutSeconds) : ''}
          onChange={(e) => onTimeout(e.target.value)}
          className={`w-24 text-right ${field}`}
        />
      </label>

      <label className="flex items-center justify-between gap-3">
        <span>
          Redirecciones
          <span className="block text-[11px] text-zinc-500">
            Global: {globals ? (globals.followRedirects ? 'seguirlas' : 'no seguirlas') : '…'}
          </span>
        </span>
        <select
          value={redirectValue}
          onChange={(e) => onRedirects(e.target.value)}
          className={field}
        >
          <option value="default">Usar ajuste global</option>
          <option value="follow">Seguirlas</option>
          <option value="manual">No seguirlas (ver el 3xx)</option>
        </select>
      </label>

      {hasOverrides(overrides) && (
        <button
          onClick={() => setOverrides({})}
          className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-200 hover:bg-zinc-700"
        >
          Restablecer
        </button>
      )}
    </div>
  )
}
