import type { Environment, HttpMethod } from './types'

const SAFE_METHODS: HttpMethod[] = ['GET', 'HEAD', 'OPTIONS']

/** ¿El método modifica datos en el servidor? */
export const isWriteMethod = (method: HttpMethod): boolean => !SAFE_METHODS.includes(method)

/** Mensaje de confirmación para una petición suelta; null si no hace falta preguntar */
export function confirmSendMessage(
  env: Environment | null,
  method: HttpMethod,
  url: string
): string | null {
  if (!env?.protected || !isWriteMethod(method)) return null
  return `Entorno protegido: "${env.name}"\n\nVas a enviar ${method} a:\n${url}\n\n¿Continuar?`
}

/** Mensaje de confirmación para el Runner; null si no hace falta preguntar */
export function confirmRunMessage(env: Environment | null, writeCount: number): string | null {
  if (!env?.protected || writeCount === 0) return null
  return `Entorno protegido: "${env.name}"\n\nEl Runner va a enviar ${writeCount} petición(es) que modifican datos (POST/PUT/PATCH/DELETE). ¿Continuar?`
}