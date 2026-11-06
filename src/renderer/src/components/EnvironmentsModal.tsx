import { useRef, useState } from 'react'
import type { EnvVariable, Environment, EnvironmentsData } from '../../../shared/types'
import {
  exportDotenv,
  exportEnvironment,
  parseDotenv,
  parseEnvironmentFile
} from '../../../shared/envTransfer'
import { mergeVariables } from '../../../shared/envMerge'
import { downloadText } from '../lib/download'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { Modal } from './Modal'
import { diffEnvironments, type EnvDiffRow, type EnvDiffStatus } from '../../../shared/envDiff'
import { GLOBALS_ID } from '../../../shared/variables'
import { ENV_TONES } from '../../../shared/envColor'

const newVar = (): EnvVariable => ({
  id: crypto.randomUUID(),
  key: '',
  value: '',
  secret: false,
  enabled: true
})

const inputClass =
  'rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 font-mono text-xs outline-none placeholder:text-zinc-500 focus:border-blue-500'

const DIFF_LABEL: Record<EnvDiffStatus, { text: string; tone: string }> = {
  different: { text: 'Distinta', tone: 'bg-amber-500/20 text-amber-400' },
  onlyA: { text: 'Solo aquí', tone: 'bg-blue-500/20 text-blue-400' },
  onlyB: { text: 'Falta aquí', tone: 'bg-red-500/20 text-red-400' },
  same: { text: 'Igual', tone: 'bg-zinc-800 text-zinc-500' }
}

export function EnvironmentsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { data, save } = useEnvironmentStore()

  // Trabajamos sobre una copia; solo se persiste al pulsar "Guardar"
  const [draft, setDraft] = useState<EnvironmentsData>(() => {
    const copy = structuredClone(data)
    // Fila vacía al final, como en el resto del editor
    copy.globals = [...(copy.globals ?? []), newVar()]
    return copy
  })
  const [selectedId, setSelectedId] = useState<string | null>(
    data.activeId ?? data.environments[0]?.id ?? null
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [compareId, setCompareId] = useState('')

  const [onlyDiff, setOnlyDiff] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  // Pegar variables en bloque (formato .env)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteOverwrite, setPasteOverwrite] = useState(true)
  const [pasteMsg, setPasteMsg] = useState('')

  const isGlobals = selectedId === GLOBALS_ID
  const selected: Environment | null = isGlobals
    ? { id: GLOBALS_ID, name: 'Variables globales', variables: draft.globals ?? [] }
    : (draft.environments.find((e) => e.id === selectedId) ?? null)

  const other = isGlobals
    ? null
    : (draft.environments.find((e) => e.id === compareId && e.id !== selected?.id) ?? null)
  const diffRows = selected && other ? diffEnvironments(selected, other) : []

  const counts = { different: 0, onlyA: 0, onlyB: 0, same: 0 }
  for (const r of diffRows) counts[r.status]++
  const shownRows = onlyDiff ? diffRows.filter((r) => r.status !== 'same') : diffRows

  const updateEnv = (id: string, patch: Partial<Environment>): void => {
    if (id === GLOBALS_ID) {
      if (patch.variables) setDraft((d) => ({ ...d, globals: patch.variables }))
      return
    }
    setDraft((d) => ({
      ...d,
      environments: d.environments.map((e) => (e.id === id ? { ...e, ...patch } : e))
    }))
  }
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
      ...d,
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

  // Agrega al entorno actual las variables que solo existen en el otro (sin valor)
  const addMissing = (): void => {
    if (!selected) return
    const have = new Set(selected.variables.map((v) => v.key.trim()))
    const missing = diffRows
      .filter((r) => r.status === 'onlyB' && !have.has(r.key))
      .map((r) => ({ ...newVar(), key: r.key, secret: r.secretB }))
    if (!missing.length) return
    setVars([...selected.variables.filter((v) => v.key || v.value), ...missing, newVar()])
  }

  // Resuelve una diferencia concreta. Los valores secretos nunca se copian: solo la clave.
  const applyRow = (r: EnvDiffRow): void => {
    if (!selected || !other) return
    if (r.status === 'different' && !r.secret) {
      setVars(
        selected.variables.map((v) =>
          v.enabled && v.key.trim() === r.key ? { ...v, value: r.b ?? '' } : v
        )
      )
    } else if (r.status === 'onlyB') {
      const added: EnvVariable = {
        ...newVar(),
        key: r.key,
        secret: r.secretB,
        value: r.secretB ? '' : (r.b ?? '')
      }
      setVars([...selected.variables.filter((v) => v.key || v.value), added, newVar()])
    } else if (r.status === 'onlyA') {
      const added: EnvVariable = {
        ...newVar(),
        key: r.key,
        secret: r.secret,
        value: r.secret ? '' : (r.a ?? '')
      }
      updateEnv(other.id, {
        variables: [...other.variables.filter((v) => v.key || v.value), added, newVar()]
      })
    }
  }

  const exportEnv = (format: 'json' | 'env' = 'json'): void => {
    if (!selected) return
    const hasSecrets = selected.variables.some((v) => v.secret && v.value)
    const includeSecrets =
      hasSecrets &&
      window.confirm(
        'Este entorno tiene variables secretas.\n\nAceptar: incluir sus valores en el archivo.\nCancelar: exportarlas vacías.'
      )
    const fileName = selected.name.trim().replace(/[^\w.-]+/g, '-') || 'entorno'
    if (format === 'env') {
      downloadText(`${fileName}.env`, exportDotenv(selected, includeSecrets), 'text/plain')
      return
    }
    downloadText(
      `${fileName}.sonda-env.json`,
      exportEnvironment(selected, includeSecrets),
      'application/json'
    )
  }

  const applyPaste = (): void => {
    if (!selected) return
    try {
      const { environments, warnings } = parseDotenv(pasteText, 'pegado')
      const result = mergeVariables(selected.variables, environments[0].variables, pasteOverwrite)
      setVars([...result.variables, newVar()])
      const summary = `${result.added} nuevas, ${result.updated} actualizadas, ${result.skipped} sin cambios`
      setPasteMsg(warnings.length ? `${summary} · ${warnings.join(' · ')}` : summary)
      setPasteText('')
    } catch (err) {
      setPasteMsg(err instanceof Error ? err.message : 'No se pudo leer el texto')
    }
  }

  const readClipboard = async (): Promise<void> => {
    try {
      setPasteText(await navigator.clipboard.readText())
      setPasteMsg('')
    } catch {
      setPasteMsg('No se pudo leer el portapapeles. Pega el texto con Cmd/Ctrl + V.')
    }
  }

  const importEnv = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!file) return
    try {
      const { environments, warnings } = parseEnvironmentFile(await file.text(), file.name)
      const taken = new Set(draft.environments.map((x) => x.name))
      const added = environments.map((env) => {
        let name = env.name
        if (taken.has(name)) name = `${env.name} (importado)`
        taken.add(name)
        // Fila vacía al final, como en el resto del editor
        return { ...env, name, variables: [...env.variables, newVar()] }
      })
      setDraft((d) => ({ ...d, environments: [...d.environments, ...added] }))
      setSelectedId(added[0].id)
      setError(warnings.join(' · '))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar el archivo')
    }
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
        })),
        globals: (draft.globals ?? [])
          .filter((v) => v.key.trim())
          .map((v) => ({ ...v, key: v.key.trim() }))
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
            <div
              onClick={() => setSelectedId(GLOBALS_ID)}
              className={`mb-0.5 flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs ${
                isGlobals ? 'bg-blue-500/15 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/70'
              }`}
              title="Valen en todos los entornos"
            >
              <span className="flex-1 truncate">Globales</span>
              <span className="text-[10px] text-zinc-500">todos</span>
            </div>
            <div className="my-1 border-t border-zinc-800" />
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
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex gap-1">
              <button
                onClick={addEnv}
                className="flex-1 rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                + Nuevo
              </button>
              <button
                onClick={duplicateEnv}
                disabled={!selected || isGlobals}
                className="rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                title="Duplicar entorno"
              >
                Duplicar
              </button>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                title="Importar desde Sonda, Postman (.json) o un archivo .env"
              >
                Importar
              </button>
              <button
                onClick={() => exportEnv('json')}
                disabled={!selected}
                className="flex-1 rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                title="Exportar el entorno seleccionado (.json)"
              >
                Exportar
              </button>
              <button
                onClick={() => exportEnv('env')}
                disabled={!selected}
                className="rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                title="Exportar el entorno seleccionado como archivo .env"
              >
                .env
              </button>
            </div>
            <input ref={fileRef} type="file" onChange={importEnv} className="hidden" />
          </div>
        </div>

        {/* Variables del entorno seleccionado */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <p className="m-auto text-xs text-zinc-500">Crea un entorno para empezar.</p>
          ) : (
            <>
              {isGlobals ? (
                <p className="mb-3 text-sm font-semibold text-zinc-200">
                  Variables globales
                  <span className="mt-1 block text-xs font-normal text-zinc-500">
                    Valen en todos los entornos. Si un entorno o una colección define la misma
                    variable, esa tiene prioridad.
                  </span>
                </p>
              ) : (
                <>
                  <input
                    value={selected.name}
                    onChange={(e) => updateEnv(selected.id, { name: e.target.value })}
                    placeholder="Nombre del entorno"
                    className={`${inputClass} mb-2 font-sans text-sm font-semibold`}
                  />

                  <label className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={selected.protected === true}
                      onChange={(e) => updateEnv(selected.id, { protected: e.target.checked })}
                    />
                    Entorno protegido (confirmar antes de enviar POST, PUT, PATCH y DELETE)
                  </label>

                  <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
                    <span>Color</span>
                    <button
                      onClick={() => updateEnv(selected.id, { color: undefined })}
                      title="Sin color"
                      className={`h-5 rounded border px-1.5 text-[10px] ${
                        !selected.color
                          ? 'border-blue-500 text-zinc-200'
                          : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
                      }`}
                    >
                      Ninguno
                    </button>
                    {ENV_TONES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => updateEnv(selected.id, { color: t.id })}
                        title={t.label}
                        aria-label={t.label}
                        className={`h-5 w-5 rounded-full ${t.dot} ${
                          selected.color === t.id
                            ? 'ring-2 ring-white/70 ring-offset-1 ring-offset-zinc-900'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}

              {!isGlobals && draft.environments.length > 1 && (
                <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                  <span>Comparar con</span>
                  <select
                    value={other?.id ?? ''}
                    onChange={(e) => setCompareId(e.target.value)}
                    className={`${inputClass} font-sans`}
                  >
                    <option value="">— ninguno —</option>
                    {draft.environments
                      .filter((e) => e.id !== selected.id)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                  {other && diffRows.some((r) => r.status === 'onlyB') && (
                    <button
                      onClick={addMissing}
                      className="ml-auto rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                      title="Agrega aquí las variables que solo existen en el otro entorno (sin valor)"
                    >
                      Agregar las que faltan
                    </button>
                  )}
                </div>
              )}

              {other ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-amber-400">{counts.different} distintas</span>
                    <span className="text-blue-400">{counts.onlyA} solo aquí</span>
                    <span className="text-red-400">{counts.onlyB} faltan aquí</span>
                    <span className="text-zinc-500">{counts.same} iguales</span>
                    <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-zinc-400">
                      <input
                        type="checkbox"
                        checked={onlyDiff}
                        onChange={(e) => setOnlyDiff(e.target.checked)}
                        className="accent-blue-500"
                      />
                      Solo diferencias
                    </label>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="text-zinc-500">
                        <tr>
                          <th className="py-1 pr-2 font-normal">Variable</th>
                          <th className="py-1 pr-2 font-normal">{selected.name}</th>
                          <th className="py-1 pr-2 font-normal">{other.name}</th>
                          <th className="py-1 font-normal" />
                        </tr>
                      </thead>
                      <tbody>
                        {shownRows.map((r) => {
                          const show = (v: string | undefined): string =>
                            v === undefined ? '—' : r.secret ? '••••••' : v || '(vacío)'
                          const action =
                            r.status === 'different' && !r.secret
                              ? { label: '← Traer valor', title: `Usar el valor de ${other.name}` }
                              : r.status === 'onlyB'
                                ? {
                                    label: '← Agregar',
                                    title: r.secretB
                                      ? 'Agregar la variable (sin valor, es secreta)'
                                      : `Agregar la variable con el valor de ${other.name}`
                                  }
                                : r.status === 'onlyA'
                                  ? {
                                      label: '→ Enviar',
                                      title: r.secret
                                        ? `Agregar la variable a ${other.name} (sin valor, es secreta)`
                                        : `Copiar la variable a ${other.name}`
                                    }
                                  : null
                          return (
                            <tr key={r.key} className="border-t border-zinc-800">
                              <td className="py-1.5 pr-2 text-zinc-200">{r.key}</td>
                              <td className="max-w-40 truncate py-1.5 pr-2 text-zinc-400">
                                {show(r.a)}
                              </td>
                              <td className="max-w-40 truncate py-1.5 pr-2 text-zinc-400">
                                {show(r.b)}
                              </td>
                              <td className="whitespace-nowrap py-1.5 text-right">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${DIFF_LABEL[r.status].tone}`}
                                >
                                  {DIFF_LABEL[r.status].text}
                                </span>
                                {action && (
                                  <button
                                    onClick={() => applyRow(r)}
                                    title={action.title}
                                    className="ml-1.5 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-700"
                                  >
                                    {action.label}
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {shownRows.length === 0 && (
                      <p className="py-4 text-center text-xs text-zinc-500">
                        {diffRows.length > 0
                          ? 'Los dos entornos tienen las mismas variables y valores.'
                          : 'Ninguno de los dos tiene variables activas.'}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="mb-2 text-xs text-zinc-500">
                    Úsalas como <code>{'{{nombre}}'}</code> en la URL, los headers o el body. Las
                    marcadas como secreto se cifran en el keychain.
                  </p>

                  <div className="mb-2">
                    <button
                      onClick={() => {
                        setPasteOpen((o) => !o)
                        setPasteMsg('')
                      }}
                      className="rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                    >
                      {pasteOpen ? 'Cerrar pegado' : 'Pegar variables…'}
                    </button>
                  </div>

                  {pasteOpen && (
                    <div className="mb-3 rounded-md border border-zinc-800 p-2">
                      <textarea
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        rows={5}
                        spellCheck={false}
                        placeholder={'API_URL=https://api.ejemplo.com\nAPI_TOKEN=abc123'}
                        className={`${inputClass} w-full`}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={pasteOverwrite}
                            onChange={(e) => setPasteOverwrite(e.target.checked)}
                            className="accent-blue-500"
                          />
                          Sobrescribir las que ya existen
                        </label>
                        <button
                          onClick={() => void readClipboard()}
                          className="rounded-md bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700"
                        >
                          Leer portapapeles
                        </button>
                        <button
                          onClick={applyPaste}
                          disabled={!pasteText.trim()}
                          className="ml-auto rounded-md bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          Importar
                        </button>
                      </div>
                      {pasteMsg && <p className="mt-2 text-[11px] text-zinc-400">{pasteMsg}</p>}
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Formato .env: una variable por línea (CLAVE=valor). Las que parecen
                        credenciales (token, password, api key…) se marcan como secreto. Los cambios
                        se guardan al pulsar «Guardar».
                      </p>
                    </div>
                  )}

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
        <button onClick={onClose} className="btn btn-ghost">
          Cancelar
        </button>
        <button onClick={submit} disabled={saving} className="btn btn-primary">
          Guardar
        </button>
      </div>
    </Modal>
  )
}
