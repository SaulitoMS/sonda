export const BACKUP_FORMAT = 'sonda-backup'
export const BACKUP_VERSION = 1
/** Un archivo más grande que esto no entra en el backup */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_FILES = 5000

export interface BackupFile {
  /** Ruta relativa al workspace, con "/" como separador */
  path: string
  content: string
}

type Raw = Record<string, unknown>

const isObj = (x: unknown): x is Raw => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Ruta relativa segura: sin "..", sin rutas absolutas, sin "\" ni caracteres de control */
export function isSafeRelPath(path: string): boolean {
  if (!path || path.length > 300) return false
  // eslint-disable-next-line no-control-regex
  if (path.startsWith('/') || path.includes('\\') || /[\u0000-\u001f]/.test(path)) return false
  if (/^[a-zA-Z]:/.test(path)) return false
  return path.split('/').every((s) => s !== '' && s !== '.' && s !== '..')
}

/** ¿Va dentro del backup? Solo JSON, sin la papelera ni carpetas de herramientas */
export function isBackupPath(path: string): boolean {
  if (!isSafeRelPath(path) || !path.endsWith('.json')) return false
  const parts = path.split('/')
  if (parts.some((p) => p === '.git' || p === 'node_modules')) return false
  return !(parts[0] === '.sonda' && parts[1] === 'trash')
}

const isJson = (text: string): boolean => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/** Arma el archivo de backup con las rutas válidas, ordenadas */
export function buildBackup(files: BackupFile[], now: Date): string {
  const valid = files
    .filter((f) => isBackupPath(f.path))
    .sort((a, b) => a.path.localeCompare(b.path))
  return (
    JSON.stringify(
      {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: now.toISOString(),
        files: valid
      },
      null,
      2
    ) + '\n'
  )
}

/** Lee un backup. Lanza un error legible si no sirve; descarta (y cuenta) los archivos dudosos */
export function parseBackup(raw: string): { files: BackupFile[]; ignored: number } {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('El archivo no es un JSON válido')
  }
  if (!isObj(data) || data.format !== BACKUP_FORMAT) throw new Error('No es un backup de Sonda')
  if (data.version !== BACKUP_VERSION) throw new Error('La versión del backup no es compatible')
  if (!Array.isArray(data.files)) throw new Error('El backup no contiene archivos')
  if (data.files.length > MAX_FILES) throw new Error(`El backup tiene más de ${MAX_FILES} archivos`)

  const files: BackupFile[] = []
  const seen = new Set<string>()
  let ignored = 0
  for (const f of data.files) {
    const ok =
      isObj(f) &&
      typeof f.path === 'string' &&
      typeof f.content === 'string' &&
      isBackupPath(f.path) &&
      !seen.has(f.path) &&
      isJson(f.content)
    if (!ok) {
      ignored++
      continue
    }
    seen.add(f.path as string)
    files.push({ path: f.path as string, content: f.content as string })
  }
  return { files, ignored }
}

/** Separa lo que se puede escribir de lo que ya existe (la restauración nunca pisa archivos) */
export function planRestore(
  files: BackupFile[],
  existing: ReadonlySet<string>
): { write: BackupFile[]; skipped: number } {
  const write = files.filter((f) => !existing.has(f.path))
  return { write, skipped: files.length - write.length }
}
