import type { AuthConfig, AuthType } from '../../../shared/types'
import { useRequestStore } from '../store/useRequestStore'
import { VariableInput } from './VariableInput'

const TYPES: { value: AuthType; label: string }[] = [
  { value: 'none', label: 'Sin autenticación' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apikey', label: 'API Key' }
]

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-zinc-400">{label}</span>
      {children}
    </div>
  )
}

const selectClass =
  'rounded-md border border-zinc-700 bg-zinc-800 px-2 py-2 text-xs text-zinc-200 outline-none focus:border-blue-500'

export function AuthPanel(): React.JSX.Element {
  const auth = useRequestStore((s) => s.auth)
  const setAuth = useRequestStore((s) => s.setAuth)

  const patch = (p: Partial<AuthConfig>): void => setAuth({ ...auth, ...p })

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <Field label="Tipo">
        <select
          value={auth.type}
          onChange={(e) => patch({ type: e.target.value as AuthType })}
          className={selectClass}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      {auth.type === 'bearer' && (
        <Field label="Token">
          <VariableInput
            value={auth.token}
            onChange={(token) => patch({ token })}
            placeholder="{{token}}"
          />
        </Field>
      )}

      {auth.type === 'basic' && (
        <>
          <Field label="Usuario">
            <VariableInput
              value={auth.username}
              onChange={(username) => patch({ username })}
              placeholder="{{usuario}}"
            />
          </Field>
          <Field label="Contraseña">
            <VariableInput
              value={auth.password}
              onChange={(password) => patch({ password })}
              placeholder="{{contraseña}}"
            />
          </Field>
        </>
      )}

      {auth.type === 'apikey' && (
        <>
          <Field label="Nombre">
            <VariableInput
              value={auth.keyName}
              onChange={(keyName) => patch({ keyName })}
              placeholder="X-API-Key"
            />
          </Field>
          <Field label="Valor">
            <VariableInput
              value={auth.keyValue}
              onChange={(keyValue) => patch({ keyValue })}
              placeholder="{{apiKey}}"
            />
          </Field>
          <Field label="Agregar a">
            <select
              value={auth.keyIn}
              onChange={(e) => patch({ keyIn: e.target.value as AuthConfig['keyIn'] })}
              className={selectClass}
            >
              <option value="header">Header</option>
              <option value="query">Query param</option>
            </select>
          </Field>
        </>
      )}

      {auth.type !== 'none' && (
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Usa variables como <span className="font-mono text-zinc-400">{'{{token}}'}</span> y
          márcalas como <b>secretas</b> en el entorno: así el valor real no se guarda en el archivo
          de la petición. Si ya existe un header manual con el mismo nombre, ese tiene prioridad.
        </p>
      )}
    </div>
  )
}
