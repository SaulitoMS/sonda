import type { Environment } from './types'
import { interpolate } from './variables'

const PROD_ENV = /\b(prod|production|produccion|producción|prd|live)\b/i
const NON_PROD_ENV =
  /\b(local|localhost|dev|development|desarrollo|test|testing|qa|stage|staging|stg|pruebas|sandbox)\b/i
const NON_PROD_HOST = /(^|[.-])(dev|development|test|testing|qa|stage|staging|stg|sandbox)([.-]|$)/i
const PROD_HOST = /(^|[.-])(prod|production|prd)([.-]|$)/i

const HOST_RE = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?(\[[^\]]+\]|[^/?#:]+)/i

/** Host de una URL aunque tenga {{variables}} sin resolver (null si no se puede leer) */
export function hostOf(url: string): string | null {
  const m = HOST_RE.exec(url.trim())
  return m ? m[1].toLowerCase() : null
}

const isLocalHost = (host: string): boolean =>
  host === 'localhost' ||
  host === '[::1]' ||
  /^127(\.\d{1,3}){3}$/.test(host) ||
  host.endsWith('.localhost') ||
  host.endsWith('.local')

export interface EnvMismatch {
  /** Texto para el confirm() */
  message: string
  /** Identifica el par entorno + host, para no volver a preguntar en la misma sesión */
  key: string
}

/**
 * Avisa si el entorno activo y el servidor de la URL no parecen ir juntos:
 * un entorno de producción apuntando a localhost, staging o dev, o un entorno de
 * desarrollo apuntando a un host de producción. Es una heurística por nombres, solo avisa.
 */
export function envMismatch(
  env: Environment | null,
  url: string,
  vars: Record<string, string>
): EnvMismatch | null {
  if (!env) return null

  const { text } = interpolate(url, vars, { dynamic: false })
  const host = hostOf(text)
  if (!host) return null

  const key = `${env.id}|${host}`
  const isProdEnv = PROD_ENV.test(env.name)

  if (isProdEnv && (isLocalHost(host) || NON_PROD_HOST.test(host))) {
    return {
      key,
      message: `El entorno "${env.name}" parece de producción, pero la URL apunta a "${host}", que parece un servidor de pruebas.\n\n¿Enviar de todos modos?`
    }
  }

  if (!isProdEnv && NON_PROD_ENV.test(env.name) && PROD_HOST.test(host)) {
    return {
      key,
      message: `El entorno "${env.name}" parece de pruebas, pero la URL apunta a "${host}", que parece de producción.\n\n¿Enviar de todos modos?`
    }
  }

  return null
}
