import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { Icon } from './Icon'

export function EnvironmentSelector({ onManage }: { onManage: () => void }): React.JSX.Element {
  const { data, setActive } = useEnvironmentStore()

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
          className="max-w-28 appearance-none rounded-md border border-zinc-700 bg-zinc-800 py-1 pl-7 pr-6 text-xs text-zinc-200 outline-none transition-colors hover:border-zinc-600 focus:border-blue-500 sm:max-w-44"
          title="Entorno activo"
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