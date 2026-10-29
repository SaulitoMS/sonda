import { app, ipcMain, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import type { Environment, EnvironmentsData } from '../shared/types'

// Valores públicos: dentro del workspace (versionable)
const envFile = (): string => join(app.getPath('documents'), 'Sonda', '.sonda', 'environments.json')

// Secretos cifrados: fuera del workspace, en los datos de la app
const secretsFile = (): string => join(app.getPath('userData'), 'secrets.json')

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as T
  } catch {
    return fallback
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('El keychain del sistema no está disponible, no se pueden guardar secretos')
  }
  return safeStorage.encryptString(value).toString('base64')
}

function decrypt(b64: string | undefined): string {
  if (!b64) return ''
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    return ''
  }
}

export async function loadEnvironments(): Promise<EnvironmentsData> {
  const data = await readJson<EnvironmentsData>(envFile(), { activeId: null, environments: [] })
  const secrets = await readJson<Record<string, string>>(secretsFile(), {})

  return {
    activeId: data.activeId ?? null,
    environments: (data.environments ?? []).map((env) => ({
      ...env,
      variables: (env.variables ?? []).map((v) => ({
        ...v,
        value: v.secret ? decrypt(secrets[v.id]) : v.value
      }))
    }))
  }
}

export async function saveEnvironments(data: EnvironmentsData): Promise<void> {
  if (!Array.isArray(data?.environments)) throw new Error('Datos de entornos inválidos')

  const secrets: Record<string, string> = {}

  // Si el cifrado falla, lanza antes de escribir cualquier archivo
  const publicData: EnvironmentsData = {
    activeId: data.activeId ?? null,
    environments: data.environments.map((env) => ({
      ...env,
      variables: env.variables.map((v) => {
        if (!v.secret) return v
        if (v.value) secrets[v.id] = encrypt(v.value)
        return { ...v, value: '' }
      })
    }))
  }

  await writeJson(secretsFile(), secrets)
  await writeJson(envFile(), publicData)
}

/** Lo usa el importador de Swagger: crea un entorno con baseUrl y lo activa */
export async function addImportedEnvironment(name: string, baseUrl: string): Promise<void> {
  const data = await loadEnvironments()
  const env: Environment = {
    id: randomUUID(),
    name,
    variables: [{ id: randomUUID(), key: 'baseUrl', value: baseUrl, secret: false, enabled: true }]
  }
  await saveEnvironments({ activeId: env.id, environments: [...data.environments, env] })
}

export function registerEnvironmentHandlers(): void {
  ipcMain.handle('environments:load', () => loadEnvironments())
  ipcMain.handle('environments:save', (_e, data: EnvironmentsData) => saveEnvironments(data))
}
