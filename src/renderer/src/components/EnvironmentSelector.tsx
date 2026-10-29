import { useEnvironmentStore } from '../store/useEnvironmentStore'

export function EnvironmentSelector({ onManage }: { onManage: () => void }): React.JSX.Element {
  const { data, setActive } = useEnvironmentStore()

  return (
    <div className="flex items-center gap-1">
      <select
        value={data.activeId ?? ''}
        onChange={(e) => setActive(e.target.value || null)}
        className="max-w-48 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-blue-500"
        title="Entorno activo"
      >
        <option value="">Sin entorno</option>
        {data.environments.map((env) => (
          <option key={env.id} value={env.id}>
            {env.name}
          </option>
        ))}
      </select>
      <button
        onClick={onManage}
        className="rounded px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        title="Gestionar entornos"
      >
        Entornos
      </button>
    </div>
  )
}
