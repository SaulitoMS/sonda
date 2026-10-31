import { useEffect, useMemo, useState } from 'react'
import { decodeJwt, describeExpiry } from '../../../shared/jwt'
import { buildVarMap, interpolate } from '../../../shared/variables'
import { useEnvironmentStore } from '../store/useEnvironmentStore'

const CLAIMS = ['sub', 'iss', 'aud', 'scope'] as const

const show = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value))

/** Muestra qué dice el token (algoritmo, expiración, claims). No verifica la firma */
export function JwtInfo({ token }: { token: string }): React.JSX.Element | null {
  const env = useEnvironmentStore(
    (s) => s.data.environments.find((e) => e.id === s.data.activeId) ?? null
  )
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Mantiene al día el "expira en…" mientras el panel está abierto
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const jwt = useMemo(
    () => decodeJwt(interpolate(token, buildVarMap(env), { dynamic: false }).text),
    [token, env]
  )
  if (!jwt) return null

  const expiry = jwt.expiresAt !== undefined ? describeExpiry(jwt.expiresAt, now) : null
  const notYet = jwt.notBefore !== undefined && jwt.notBefore > now
  const claims = CLAIMS.filter((c) => jwt.payload[c] !== undefined)

  return (
    <div className="selectable ml-[7.75rem] space-y-1.5 rounded-md border border-zinc-800 bg-zinc-900/50 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-zinc-300">JWT</span>
        {typeof jwt.header.alg === 'string' && (
          <span className="text-zinc-500">{jwt.header.alg}</span>
        )}
        {expiry ? (
          <span className={expiry.expired ? 'font-semibold text-red-400' : 'text-emerald-400'}>
            {expiry.label}
          </span>
        ) : (
          <span className="text-zinc-500">Sin fecha de expiración</span>
        )}
        {notYet && <span className="text-amber-400">Aún no es válido (nbf)</span>}
        <button
          onClick={() => setOpen((o) => !o)}
          className="ml-auto text-zinc-400 hover:text-zinc-200"
        >
          {open ? 'Ocultar payload' : 'Ver payload'}
        </button>
      </div>

      {claims.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-zinc-400">
          {claims.map((c) => (
            <span key={c}>
              <span className="text-zinc-500">{c}:</span> {show(jwt.payload[c])}
            </span>
          ))}
        </div>
      )}

      {open && (
        <pre className="max-h-48 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] text-zinc-300">
          {JSON.stringify(jwt.payload, null, 2)}
        </pre>
      )}
      <p className="text-[10px] text-zinc-600">Solo se decodifica; la firma no se verifica.</p>
    </div>
  )
}
