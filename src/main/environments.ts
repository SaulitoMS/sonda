import { app, ipcMain, safeStorage } from 'electron'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import type { EnvVariable, Environment, EnvironmentsData } from '../shared/types'
import { getWorkspacePath } from './settings'

// Valores públicos: dentro del workspace (versionable)
const envFile = (): string => join(getWorkspacePath(), '.sonda', 'environments.json')

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

const revealSecrets = (
  vars: EnvVariable[] | undefined,
  secrets: Record<string, string>
): EnvVariable[] =>
  (vars ?? []).map((v) => ({ ...v, value: v.secret ? decrypt(secrets[v.id]) : v.value }))

export async function loadEnvironments(): Promise<EnvironmentsData> {
  const data = await readJson<EnvironmentsData>(envFile(), { activeId: null, environments: [] })
  const secrets = await readJson<Record<string, string>>(secretsFile(), {})

  return {
    activeId: data.activeId ?? null,
    environments: (data.environments ?? []).map((env) => ({
      ...env,
      variables: revealSecrets(env.variables, secrets)
    })),
    globals: revealSecrets(data.globals, secrets)
  }
}

export async function saveEnvironments(data: EnvironmentsData): Promise<void> {
  if (!Array.isArray(data?.environments)) throw new Error('Datos de entornos inválidos')

  const secrets: Record<string, string> = {}

  // Si el cifrado falla, lanza antes de escribir cualquier archivo
  const hideSecrets = (vars: EnvVariable[]): EnvVariable[] =>
    vars.map((v) => {
      if (!v.secret) return v
      if (v.value) secrets[v.id] = encrypt(v.value)
      return { ...v, value: '' }
    })

  const publicData: EnvironmentsData = {
    activeId: data.activeId ?? null,
    environments: data.environments.map((env) => ({
      ...env,
      variables: hideSecrets(env.variables)
    })),
    globals: hideSecrets(data.globals ?? [])
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
  await saveEnvironments({
    activeId: env.id,
    environments: [...data.environments, env],
    globals: data.globals
  })
}

/** Lo usa el importador de Postman: crea un entorno con las variables de la colección y lo activa */
export async function addEnvironmentWithVariables(
  name: string,
  variables: { key: string; value: string }[]
): Promise<void> {
  const data = await loadEnvironments()
  const env: Environment = {
    id: randomUUID(),
    name,
    variables: variables.map((v) => ({
      id: randomUUID(),
      key: v.key,
      value: v.value,
      secret: false,
      enabled: true
    }))
  }
  await saveEnvironments({
    activeId: env.id,
    environments: [...data.environments, env],
    globals: data.globals
  })
}

export function registerEnvironmentHandlers(): void {
  ipcMain.handle('environments:load', () => loadEnvironments())
  ipcMain.handle('environments:save', (_e, data: EnvironmentsData) => saveEnvironments(data))
}
