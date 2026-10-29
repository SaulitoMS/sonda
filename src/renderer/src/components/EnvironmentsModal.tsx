import { useState } from 'react'
import type { EnvVariable, Environment, EnvironmentsData } from '../../../shared/types'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { Modal } from './Modal'

const newVar = (): EnvVariable => ({
  id: crypto.randomUUID(),
  key: '',
  value: '',
  secret: false,
  enabled: true
})

const inputClass =
  'rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500'

export function EnvironmentsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { data, save } = useEnvironmentStore()

  // Trabajamos sobre una copia; solo se persiste al pulsar "Guardar"
  const [draft, setDraft] = useState<EnvironmentsData>(() => structuredClone(data))
  const [selectedId, setSelectedId] = useState<string | null>(
    data.activeId ?? data.environments[0]?.id ?? null
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selected = draft.environments.find((e) => e.id === selectedId) ?? null

  const updateEnv = (id: string, patch: Partial<Environment>): void =>
    setDraft((d) => ({
      ...d,
      environments: d.environments.map((e) => (e.id === id ? { ...e, ...patch } : e))
    }))

  const addEnv = (): void => {
    const env: Environment = {
      id: crypto.randomUUID(),
      name: `Entorno ${draft.environments.length + 1}`,
      variables: [newVar()]
    }
    setDraft((d) => ({ ...d, environments: [...d.environments, env] }))
    setSelectedId(env.id)
  }

  const duplicateEnv = (): void => {
    if (!selected) return
    const copy: Environment = {
      id: crypto.randomUUID(),
      name: `${selected.name} (copia)`,
      variables: selected.variables.map((v) => ({ ...v, id: crypto.randomUUID() }))
    }
    setDraft((d) => ({ ...d, environments: [...d.environments, copy] }))
    setSelectedId(copy.id)
  }

  const removeEnv = (id: string): void => {
    const rest = draft.environments.filter((e) => e.id !== id)
    setDraft((d) => ({
      activeId: d.activeId === id ? null : d.activeId,
      environments: rest
    }))
    if (selectedId === id) setSelectedId(rest[0]?.id ?? null)
  }

  const setVars = (variables: EnvVariable[]): void => {
    if (selected) updateEnv(selected.id, { variables })
  }

  const patchVar = (id: string, patch: Partial<EnvVariable>): void => {
    if (!selected) return
    const next = selected.variables.map((v) => (v.id === id ? { ...v, ...patch } : v))
    const last = next[next.length - 1]
    // Siempre dejamos una fila vacía al final
    if (!last || last.key || last.value) next.push(newVar())
    setVars(next)
  }

  const removeVar = (id: string): void => {
    if (!selected) return
    const next = selected.variables.filter((v) => v.id !== id)
    setVars(next.length ? next : [newVar()])
  }

  const submit = async (): Promise<void> => {
    if (draft.environments.some((e) => !e.name.trim())) {
      setError('Todos los entornos necesitan un nombre')
      return
    }
    setSaving(true)
    setError('')
    try {
      await save({
        activeId: draft.activeId,
        environments: draft.environments.map((e) => ({
          ...e,
          name: e.name.trim(),
          variables: e.variables
            .filter((v) => v.key.trim())
            .map((v) => ({ ...v, key: v.key.trim() }))
        }))
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <Modal title="Entornos y variables" onClose={onClose} wide>
      <div className="flex h-[55vh] gap-4">
        {/* Lista de entornos */}
        <div className="flex w-48 shrink-0 flex-col border-r border-zinc-800 pr-3">
          <div className="min-h-0 flex-1 overflow-auto">
            {draft.environments.length === 0 && (
              <p className="text-xs text-zinc-500">Aún no hay entornos.</p>
            )}
            {draft.environments.map((env) => (
              <div
                key={env.id}
                onClick={() => setSelectedId(env.id)}
                className={`group mb-0.5 flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs ${
                  env.id === selectedId
                    ? 'bg-blue-500/15 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-800/70'
                }`}
              >
                <span className="flex-1 truncate">{env.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeEnv(env.id)
                  }}
                  className="hidden text-zinc-500 hover:text-red-400 group-hover:block"
                  title="Eliminar entorno"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            <button
              onClick={addEnv}
              className="flex-1 rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              + Nuevo
            </button>
            <button
              onClick={duplicateEnv}
              disabled={!selected}
              className="rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
              title="Duplicar entorno"
            >
              Duplicar
            </button>
          </div>
        </div>

        {/* Variables del entorno seleccionado */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <p className="m-auto text-xs text-zinc-500">Crea un entorno para empezar.</p>
          ) : (
            <>
              <input
                value={selected.name}
                onChange={(e) => updateEnv(selected.id, { name: e.target.value })}
                placeholder="Nombre del entorno"
                className={`${inputClass} mb-3 font-sans text-sm font-semibold`}
              />

              <p className="mb-2 text-xs text-zinc-500">
                Úsalas como <code>{'{{nombre}}'}</code> en la URL, los headers o el body. Las
                marcadas como secreto se cifran en el keychain.
              </p>

              <div className="min-h-0 flex-1 overflow-auto">
                <div className="flex flex-col gap-2">
                  {selected.variables.map((v) => (
                    <div key={v.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={v.enabled}
                        onChange={(e) => patchVar(v.id, { enabled: e.target.checked })}
                        className="accent-blue-500"
                      />
                      <input
                        value={v.key}
                        onChange={(e) => patchVar(v.id, { key: e.target.value })}
                        placeholder="Variable"
                        spellCheck={false}
                        className={`${inputClass} w-40`}
                      />
                      <input
                        type={v.secret ? 'password' : 'text'}
                        value={v.value}
                        onChange={(e) => patchVar(v.id, { value: e.target.value })}
                        placeholder="Valor"
                        spellCheck={false}
                        className={`${inputClass} min-w-0 flex-1`}
                      />
                      <button
                        onClick={() => patchVar(v.id, { secret: !v.secret })}
                        className={`rounded-md px-2 py-1.5 text-[10px] font-semibold ${
                          v.secret
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                        title="Guardar este valor cifrado en el keychain"
                      >
                        Secreto
                      </button>
                      <button
                        onClick={() => removeVar(v.id)}
                        className="px-1 text-zinc-500 hover:text-red-400"
                        title="Eliminar variable"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-md px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </Modal>
  )
}
