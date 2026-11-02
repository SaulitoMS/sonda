import { AsyncLocalStorage } from 'async_hooks'
import { lookup as dnsLookup } from 'dns'
import type { LookupFunction } from 'net'
import { buildConnector } from 'undici'
import type { ConnectionTiming } from '../shared/types'

/** Lo que se va acumulando mientras una petición abre conexiones nuevas */
export interface ConnectionCounter {
  /** Tiempo resolviendo el nombre (DNS) */
  dnsMs: number
  /** Tiempo total abriendo la conexión: incluye el DNS y, en https, el handshake TLS */
  connectMs: number
  /** Conexiones nuevas que hizo esta petición (0 = reutilizó una existente) */
  opened: number
  secure: boolean
}

const store = new AsyncLocalStorage<ConnectionCounter>()

export const newCounter = (): ConnectionCounter => ({
  dnsMs: 0,
  connectMs: 0,
  opened: 0,
  secure: false
})

/** Ejecuta `fn` anotando en `counter` lo que tarden las conexiones que abra */
export const withCounter = <T>(counter: ConnectionCounter, fn: () => Promise<T>): Promise<T> =>
  store.run(counter, fn)

const timedLookup = ((hostname, options, callback) => {
  const counter = store.getStore()
  const start = performance.now()
  dnsLookup(hostname, options, (err, address, family) => {
    if (counter) counter.dnsMs += performance.now() - start
    callback(err, address, family)
  })
}) as LookupFunction

/** Conector de undici que mide DNS y conexión de cada petición que lo use */
export function timedConnector(rejectUnauthorized: boolean): buildConnector.connector {
  const base = buildConnector({ rejectUnauthorized, lookup: timedLookup })
  return (options, callback) => {
    const counter = store.getStore()
    const start = performance.now()
    base(options, (...args) => {
      if (counter) {
        counter.connectMs += performance.now() - start
        counter.opened++
        if (options.protocol === 'https:') counter.secure = true
      }
      callback(...args)
    })
  }
}

/** Pasa lo acumulado al formato que viaja al renderer (el DNS se descuenta de la conexión) */
export function toConnectionTiming(c: ConnectionCounter): ConnectionTiming {
  const dnsMs = Math.round(c.dnsMs)
  return {
    dnsMs,
    connectMs: Math.max(0, Math.round(c.connectMs) - dnsMs),
    secure: c.secure,
    reused: c.opened === 0
  }
}