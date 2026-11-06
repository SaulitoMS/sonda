import { useState } from 'react'
import { buildVarMap, interpolate } from '../../../shared/variables'
import type { HostReport } from '../../../shared/types'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { useRequestStore } from '../store/useRequestStore'
import { Modal } from './Modal'

const field =
  'w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-blue-500 disabled:opacity-50'

/** La URL de la petición abierta, con las variables del entorno ya resueltas */
function initialTarget(): string {
  const url = useRequestStore.getState().url
  const vars = buildVarMap(useEnvironmentStore.getState().getActive())
  const { text } = interpolate(url, vars, { dynamic: false })
  return /^https?:\/\//i.test(text) ? text : ''
}

const plural = (n: number): string => `${n} ${n === 1 ? 'día' : 'días'}`

function expiry(days: number): { text: string; tone: string } {
  if (days < 0) return { text: `Venció hace ${plural(-days)}`, tone: 'text-red-400' }
  if (days === 0) return { text: 'Vence hoy', tone: 'text-red-400' }
  if (days <= 14) return { text: `Vence en ${plural(days)}`, tone: 'text-amber-400' }
  return { text: `Vence en ${plural(days)}`, tone: 'text-emerald-400' }
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="mt-4">
      <h3 className="mb-1.5 text-xs font-semibold text-zinc-300">{title}</h3>
      <div className="rounded-md border border-zinc-800">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex gap-3 border-t border-zinc-800 px-3 py-1.5 text-xs first:border-t-0">
      <span className="w-28 shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 break-all text-zinc-200">{children}</span>
    </div>
  )
}

export function HostDiagnosticsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [target, setTarget] = useState(initialTarget)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<HostReport | null>(null)

  const run = async (): Promise<void> => {
    setLoading(true)
    setError('')
    setReport(null)
    try {
      const res = await window.api.inspectHost(target)
      if (res.ok) setReport(res.report)
      else setError(res.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar el host')
    } finally {
      setLoading(false)
    }
  }

  const cert = report?.tls.ok ? report.tls.cert : null
  const weakProtocol = cert?.protocol === 'TLSv1' || cert?.protocol === 'TLSv1.1'

  return (
    <Modal
      title="Diagnóstico de host"
      icon="shield"
      description="DNS y certificado TLS del servidor"
      onClose={onClose}
      wide
    >
      <div className="flex gap-2">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) void run()
          }}
          placeholder="api.ejemplo.com o https://api.ejemplo.com:8443"
          className={`${field} font-mono`}
          autoFocus
        />
        <button
          onClick={() => void run()}
          disabled={loading || !target.trim()}
          className="shrink-0 rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {loading ? 'Analizando…' : 'Analizar'}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {report && (
        <>
          <Section title="DNS">
            {report.dns.ok ? (
              <>
                <Row label="Tiempo">{report.dns.ms} ms</Row>
                {report.dns.addresses.map((a) => (
                  <Row key={a.address} label={`IPv${a.family}`}>
                    <span className="font-mono">{a.address}</span>
                  </Row>
                ))}
              </>
            ) : (
              <Row label="Error">
                <span className="text-red-400">{report.dns.error}</span>
              </Row>
            )}
          </Section>

          <Section title={`Certificado TLS (puerto ${report.port})`}>
            {report.tls.ok && cert ? (
              <>
                <Row label="Confianza">
                  {cert.authorized ? (
                    <span className="text-emerald-400">Certificado de confianza</span>
                  ) : (
                    <span className="text-red-400">No es de confianza: {cert.authError}</span>
                  )}
                </Row>
                <Row label="Vencimiento">
                  <span className={expiry(cert.daysLeft).tone}>{expiry(cert.daysLeft).text}</span>{' '}
                  <span className="text-zinc-500">
                    ({new Date(cert.validFrom).toLocaleDateString('es')} →{' '}
                    {new Date(cert.validTo).toLocaleDateString('es')})
                  </span>
                </Row>
                <Row label="Emitido para">{cert.subject || '—'}</Row>
                <Row label="Emisor">{cert.issuer || '—'}</Row>
                <Row label="Protocolo">
                  <span className={weakProtocol ? 'text-amber-400' : ''}>
                    {cert.protocol ?? '—'}
                    {weakProtocol && ' (obsoleto)'}
                  </span>
                  {cert.cipher && <span className="text-zinc-500"> · {cert.cipher}</span>}
                </Row>
                <Row label="HTTP/2">
                  {cert.alpn === 'h2'
                    ? 'Soportado (ALPN: h2)'
                    : `No (ALPN: ${cert.alpn ?? 'ninguno'})`}
                </Row>
                <Row label="Conexión TLS">{report.tls.ms} ms</Row>
                {cert.altNames.length > 0 && (
                  <Row label="Nombres (SAN)">{cert.altNames.join(', ')}</Row>
                )}
                <Row label="Huella SHA-256">
                  <span className="font-mono text-[11px]">{cert.fingerprint256}</span>
                </Row>
              </>
            ) : (
              <Row label="Error">
                <span className="text-red-400">{report.tls.ok ? '' : report.tls.error}</span>
              </Row>
            )}
          </Section>
        </>
      )}
    </Modal>
  )
}
