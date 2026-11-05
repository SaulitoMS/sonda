import { envTone } from '../../../shared/envColor'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { Icon } from './Icon'

export function EnvironmentSelector({ onManage }: { onManage: () => void }): React.JSX.Element {
  const { data, setActive } = useEnvironmentStore()
  const active = data.environments.find((e) => e.id === data.activeId)
  const guarded = active?.protected === true
  const tone = envTone(active?.color)

  // Protegido (rojo) manda sobre el color elegido
  const selectClass = guarded
    ? 'border-red-500/70 text-red-300 focus:border-red-400'
    : tone
      ? tone.select
      : 'border-zinc-700 text-zinc-200 hover:border-zinc-600 focus:border-blue-500'

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <Icon
          name="globe"
          size={13}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500"
        />
        <select
          value={data.activeId ?? ''}
          onChange={(e) => setActive(e.target.value || null)}
          className={`max-w-28 appearance-none rounded-md border bg-zinc-800 py-1 pl-7 pr-6 text-xs outline-none transition-colors sm:max-w-44 ${selectClass}`}
          title={
            guarded ? 'Entorno protegido: pide confirmación al modificar datos' : 'Entorno activo'
          }
        >
          <option value="">Sin entorno</option>
          {data.environments.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name}
            </option>
          ))}
        </select>
        <Icon
          name="chevronDown"
          size={12}
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500"
        />
      </div>
      {tone && !guarded && (
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`}
          title={`Entorno ${tone.label.toLowerCase()}`}
        />
      )}
      {guarded && (
        <span
          className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-400"
          title="Las peticiones que modifican datos piden confirmación"
        >
          Protegido
        </span>
      )}
      <button
        onClick={onManage}
        className="hidden rounded-md px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 sm:block"
        title="Gestionar entornos"
      >
        Entornos
      </button>
    </div>
  )
}
