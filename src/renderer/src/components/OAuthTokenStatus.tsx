import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  clearOAuthCache,
  forgetOAuthToken,
  listOAuthTokens,
  oauthVersion,
  subscribeOAuth,
  type OAuthGrant
} from '../lib/oauth'
import { Icon } from './Icon'

const GRANT_LABEL: Record<OAuthGrant, string> = {
  client_credentials: 'Client Credentials',
  password: 'Password',
  authorization_code: 'Authorization Code'
}

function expiryLabel(ms: number): string {
  if (ms <= 0) return 'caducado'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'caduca en menos de 1 min'
  if (minutes < 60) return `caduca en ${minutes} min`
  return `caduca en ${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function OAuthTokenStatus(): React.JSX.Element {
  // Se vuelve a leer la lista cada vez que cambia el caché
  useSyncExternalStore(subscribeOAuth, oauthVersion)
  const tokens = listOAuthTokens()

  // Hora actual en un estado (no se puede leer Date.now() al renderizar).
  // Se actualiza cada 15 s para refrescar el "caduca en…"
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  if (tokens.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-[11px] text-zinc-500">
        <Icon name="key" size={13} />
        Sin token en memoria: se pedirá al enviar la petición.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
      {tokens.map((t) => {
        const left = t.expiresAt - now
        const expired = left <= 0
        return (
          <div key={t.id} className="flex items-center gap-2 text-[11px]">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                expired ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
              }`}
            >
              <Icon name="key" size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-200" title={t.label}>
                {t.label}
              </p>
              <p className="truncate text-zinc-500">
                {GRANT_LABEL[t.grant]} · {expiryLabel(left)}
                {t.renewable ? ' · se renueva sola' : ''}
              </p>
            </div>
            <button
              onClick={() => forgetOAuthToken(t.id)}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-400"
              title="Olvidar este token (se pedirá uno nuevo)"
              aria-label="Olvidar token"
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        )
      })}
      {tokens.length > 1 && (
        <button
          onClick={clearOAuthCache}
          className="self-end rounded-md px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          Olvidar todos
        </button>
      )}
    </div>
  )
}
