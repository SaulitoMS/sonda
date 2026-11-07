import type { AuthConfig, AuthType } from '../../../shared/types'
import { resolveAuthFor } from '../lib/inheritedAuth'
import { useCollectionsStore } from '../store/useCollectionsStore'
import { useRequestStore } from '../store/useRequestStore'
import { VariableInput } from './VariableInput'
import { JwtInfo } from './JwtInfo'
import { OAuthTokenStatus } from './OAuthTokenStatus'
import { OAUTH1_METHODS } from '../../../shared/oauth1'

const TYPES: { value: AuthType; label: string }[] = [
  { value: 'none', label: 'Sin autenticación' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'digest', label: 'Digest Auth' },
  { value: 'apikey', label: 'API Key' },
  { value: 'oauth2', label: 'OAuth 2.0' },
  { value: 'oauth1', label: 'OAuth 1.0' },
  { value: 'awsv4', label: 'AWS Signature V4' }
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

interface AuthFormProps {
  value: AuthConfig
  onChange: (auth: AuthConfig) => void
  /** Si viene, se ofrece la opción "inherit" con este texto (petición y carpeta; no la colección) */
  inheritLabel?: string
  children?: React.ReactNode
}

/** Selector de tipo y campos de la auth. Lo usan la pestaña Auth y el modal de colección / carpeta */
export function AuthForm({
  value: auth,
  onChange,
  inheritLabel,
  children
}: AuthFormProps): React.JSX.Element {
  const patch = (p: Partial<AuthConfig>): void => onChange({ ...auth, ...p })

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <Field label="Tipo">
        <select
          value={auth.type}
          onChange={(e) => patch({ type: e.target.value as AuthType })}
          className={selectClass}
        >
          {inheritLabel && <option value="inherit">{inheritLabel}</option>}
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      {children}

      {auth.type === 'bearer' && (
        <>
          <Field label="Token">
            <VariableInput
              value={auth.token}
              onChange={(token) => patch({ token })}
              placeholder="{{token}}"
            />
          </Field>
          <JwtInfo token={auth.token} />
        </>
      )}

      {(auth.type === 'basic' || auth.type === 'digest') && (
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

      {auth.type === 'awsv4' && (
        <>
          <Field label="Access Key">
            <VariableInput
              value={auth.username}
              onChange={(username) => patch({ username })}
              placeholder="{{awsAccessKey}}"
            />
          </Field>
          <Field label="Secret Key">
            <VariableInput
              value={auth.password}
              onChange={(password) => patch({ password })}
              placeholder="{{awsSecretKey}}"
            />
          </Field>
          <Field label="Session Token">
            <VariableInput
              value={auth.token}
              onChange={(token) => patch({ token })}
              placeholder="{{awsSessionToken}} (opcional)"
            />
          </Field>
          <Field label="Región">
            <VariableInput
              value={auth.awsRegion ?? ''}
              onChange={(awsRegion) => patch({ awsRegion })}
              placeholder="us-east-1"
            />
          </Field>
          <Field label="Servicio">
            <VariableInput
              value={auth.awsService ?? ''}
              onChange={(awsService) => patch({ awsService })}
              placeholder="execute-api, s3, dynamodb…"
            />
          </Field>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Sonda firma la petición al enviarla y agrega los headers{' '}
            <span className="font-mono text-zinc-400">Authorization</span> y{' '}
            <span className="font-mono text-zinc-400">X-Amz-Date</span>. No se puede firmar un body
            form-data.
          </p>
        </>
      )}

      {auth.type === 'oauth1' && (
        <>
          <Field label="Consumer Key">
            <VariableInput
              value={auth.username}
              onChange={(username) => patch({ username })}
              placeholder="{{consumerKey}}"
            />
          </Field>
          <Field label="Consumer Secret">
            <VariableInput
              value={auth.password}
              onChange={(password) => patch({ password })}
              placeholder="{{consumerSecret}}"
            />
          </Field>
          <Field label="Access Token">
            <VariableInput
              value={auth.token}
              onChange={(token) => patch({ token })}
              placeholder="{{accessToken}} (opcional)"
            />
          </Field>
          <Field label="Token Secret">
            <VariableInput
              value={auth.oauth1TokenSecret ?? ''}
              onChange={(oauth1TokenSecret) => patch({ oauth1TokenSecret })}
              placeholder="{{tokenSecret}} (opcional)"
            />
          </Field>
          <Field label="Firma">
            <select
              value={auth.oauth1Method ?? 'HMAC-SHA1'}
              onChange={(e) =>
                patch({ oauth1Method: e.target.value as AuthConfig['oauth1Method'] })
              }
              className={selectClass}
            >
              {OAUTH1_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Realm">
            <VariableInput
              value={auth.oauth1Realm ?? ''}
              onChange={(oauth1Realm) => patch({ oauth1Realm })}
              placeholder="(opcional)"
            />
          </Field>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Sonda firma la petición al enviarla y agrega el header{' '}
            <span className="font-mono text-zinc-400">Authorization</span> con los parámetros{' '}
            <span className="font-mono text-zinc-400">oauth_*</span>. Pega el token y su secreto: no
            hace el flujo de autorización.
          </p>
        </>
      )}

      {auth.type === 'oauth2' && (
        <>
          <Field label="Grant">
            <select
              value={auth.oauthGrant ?? 'client_credentials'}
              onChange={(e) => patch({ oauthGrant: e.target.value as AuthConfig['oauthGrant'] })}
              className={selectClass}
            >
              <option value="client_credentials">Client Credentials</option>
              <option value="password">Password</option>
              <option value="authorization_code">Authorization Code (PKCE)</option>
            </select>
          </Field>
          {auth.oauthGrant === 'authorization_code' && (
            <Field label="URL de autorización">
              <VariableInput
                value={auth.oauthAuthUrl ?? ''}
                onChange={(oauthAuthUrl) => patch({ oauthAuthUrl })}
                placeholder="https://proveedor.com/oauth/authorize"
              />
            </Field>
          )}
          <Field label="URL del token">
            <VariableInput
              value={auth.oauthTokenUrl ?? ''}
              onChange={(oauthTokenUrl) => patch({ oauthTokenUrl })}
              placeholder="{{baseUrl}}/oauth/token"
            />
          </Field>
          <Field label="Client ID">
            <VariableInput
              value={auth.oauthClientId ?? ''}
              onChange={(oauthClientId) => patch({ oauthClientId })}
              placeholder="{{clientId}}"
            />
          </Field>
          <Field label="Client Secret">
            <VariableInput
              value={auth.oauthClientSecret ?? ''}
              onChange={(oauthClientSecret) => patch({ oauthClientSecret })}
              placeholder={
                auth.oauthGrant === 'authorization_code'
                  ? '{{clientSecret}} (opcional con PKCE)'
                  : '{{clientSecret}}'
              }
            />
          </Field>
          {auth.oauthGrant === 'authorization_code' && (
            <Field label="Puerto callback">
              <VariableInput
                value={auth.oauthRedirectPort ?? ''}
                onChange={(oauthRedirectPort) => patch({ oauthRedirectPort })}
                placeholder="0 = automático"
              />
            </Field>
          )}
          {auth.oauthGrant === 'authorization_code' && (
            <Field label="Parámetros extra">
              <VariableInput
                value={auth.oauthAuthParams ?? ''}
                onChange={(oauthAuthParams) => patch({ oauthAuthParams })}
                placeholder="audience=https://api.ejemplo.com&prompt=consent (opcional)"
              />
            </Field>
          )}
          {auth.oauthGrant === 'password' && (
            <>
              <Field label="Usuario">
                <VariableInput
                  value={auth.oauthUsername ?? ''}
                  onChange={(oauthUsername) => patch({ oauthUsername })}
                  placeholder="{{username}}"
                />
              </Field>
              <Field label="Contraseña">
                <VariableInput
                  value={auth.oauthPassword ?? ''}
                  onChange={(oauthPassword) => patch({ oauthPassword })}
                  placeholder="{{password}}"
                />
              </Field>
            </>
          )}
          <Field label="Scope">
            <VariableInput
              value={auth.oauthScope ?? ''}
              onChange={(oauthScope) => patch({ oauthScope })}
              placeholder="read write (opcional)"
            />
          </Field>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Sonda pide el token al enviar y lo reutiliza hasta que caduca (solo en memoria). Se
            envía como <span className="font-mono text-zinc-400">Authorization: Bearer …</span>.
          </p>
          <OAuthTokenStatus />
          {auth.oauthGrant === 'authorization_code' && (
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Se abrirá tu navegador para iniciar sesión. Registra en tu proveedor la redirección{' '}
              <span className="font-mono text-zinc-400">
                http://127.0.0.1:{auth.oauthRedirectPort || 'PUERTO'}/callback
              </span>
              . Si tu proveedor exige una URL exacta, fija un puerto (por ejemplo 8765); si no,
              déjalo en 0.
            </p>
          )}
        </>
      )}

      {auth.type !== 'none' && auth.type !== 'inherit' && (
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Usa variables como <span className="font-mono text-zinc-400">{'{{token}}'}</span> y
          márcalas como <b>secretas</b> en el entorno: así el valor real no se guarda en el archivo
          de la petición. Si ya existe un header manual con el mismo nombre, ese tiene prioridad.
        </p>
      )}
    </div>
  )
}

/** Pestaña Auth de la petición abierta: puede heredar la auth de su carpeta o colección */
export function AuthPanel(): React.JSX.Element {
  const auth = useRequestStore((s) => s.auth)
  const setAuth = useRequestStore((s) => s.setAuth)
  const currentFile = useRequestStore((s) => s.currentFile)
  const collections = useCollectionsStore((s) => s.collections)

  const inherited = resolveAuthFor(collections, auth, currentFile)
  const typeLabel = TYPES.find((t) => t.value === inherited.auth?.type)?.label ?? ''

  return (
    <AuthForm value={auth} onChange={setAuth} inheritLabel="Heredar de la carpeta / colección">
      {auth.type === 'inherit' && (
        <p className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
          {!currentFile
            ? 'Guarda la petición en una colección para heredar su autenticación.'
            : inherited.source === 'none'
              ? 'La carpeta y la colección no tienen autenticación: se envía sin auth.'
              : `Usando ${typeLabel} de la ${inherited.source === 'folder' ? 'carpeta' : 'colección'} «${inherited.sourceName}».`}
        </p>
      )}
    </AuthForm>
  )
}
