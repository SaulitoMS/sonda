import { ipcMain } from 'electron'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { connect } from 'tls'
import type { HostDnsResult, HostInspectResult, HostTlsResult } from '../shared/types'

const TLS_TIMEOUT_MS = 8000
const DAY_MS = 86_400_000

const joined = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? v.join(', ') : (v ?? '')

/** Acepta "api.ejemplo.com", "api.ejemplo.com:8443" o una URL completa */
function parseTarget(raw: string): { host: string; port: number } | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`)
    const host = url.hostname.replace(/^\[|\]$/g, '')
    if (!host) return null
    return { host, port: url.port ? Number(url.port) : 443 }
  } catch {
    return null
  }
}

async function inspectDns(host: string): Promise<HostDnsResult> {
  const start = performance.now()
  try {
    const list = await lookup(host, { all: true, verbatim: true })
    return {
      ok: true,
      ms: Math.round(performance.now() - start),
      addresses: list.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }))
    }
  } catch (err) {
    return {
      ok: false,
      ms: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : 'No se pudo resolver el host'
    }
  }
}

function inspectTls(host: string, port: number): Promise<HostTlsResult> {
  return new Promise((resolve) => {
    const start = performance.now()
    const elapsed = (): number => Math.round(performance.now() - start)

    const socket = connect({
      host,
      port,
      // Solo se lee el certificado y no se envía ningún dato, por eso se acepta aunque no sea de confianza
      rejectUnauthorized: false,
      ALPNProtocols: ['h2', 'http/1.1'],
      ...(isIP(host) ? {} : { servername: host })
    })

    let settled = false
    const finish = (value: HostTlsResult): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }

    socket.setTimeout(TLS_TIMEOUT_MS, () =>
      finish({ ok: false, ms: elapsed(), error: 'Tiempo agotado' })
    )
    socket.once('error', (err) => finish({ ok: false, ms: elapsed(), error: err.message }))
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate()
      const validFrom = new Date(cert?.valid_from ?? '')
      const validTo = new Date(cert?.valid_to ?? '')
      if (!cert?.valid_to || Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) {
        finish({
          ok: false,
          ms: elapsed(),
          error: 'El servidor no presentó un certificado legible'
        })
        return
      }

      const authError = socket.authorized
        ? null
        : socket.authorizationError instanceof Error
          ? socket.authorizationError.message
          : String(socket.authorizationError || 'Certificado no confiable')

      finish({
        ok: true,
        ms: elapsed(),
        cert: {
          subject: joined(cert.subject?.CN) || joined(cert.subject?.O),
          issuer: joined(cert.issuer?.O) || joined(cert.issuer?.CN),
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysLeft: Math.floor((validTo.getTime() - Date.now()) / DAY_MS),
          altNames: (cert.subjectaltname ?? '')
            .split(',')
            .map((s) => s.trim().replace(/^DNS:/, ''))
            .filter(Boolean),
          fingerprint256: cert.fingerprint256 ?? '',
          authorized: socket.authorized,
          authError,
          protocol: socket.getProtocol(),
          cipher: socket.getCipher()?.name ?? null,
          alpn: typeof socket.alpnProtocol === 'string' ? socket.alpnProtocol : null
        }
      })
    })
  })
}

export function registerHostHandlers(): void {
  ipcMain.handle('host:inspect', async (_event, raw: string): Promise<HostInspectResult> => {
    const target = typeof raw === 'string' ? parseTarget(raw) : null
    if (!target) {
      return { ok: false, error: 'Escribe un host o una URL, por ejemplo api.ejemplo.com' }
    }
    const [dns, tls] = await Promise.all([
      inspectDns(target.host),
      inspectTls(target.host, target.port)
    ])
    return { ok: true, report: { host: target.host, port: target.port, dns, tls } }
  })
}
