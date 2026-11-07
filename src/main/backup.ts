import { app, dialog, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import type { ExportResult, RestoreResult } from '../shared/types'
import {
  buildBackup,
  isBackupPath,
  MAX_FILE_BYTES,
  parseBackup,
  planRestore,
  type BackupFile
} from '../shared/workspaceBackup'
import { getWorkspacePath } from './settings'

const MAX_BACKUP_BYTES = 200 * 1024 * 1024
const MAX_DEPTH = 6

const exists = (p: string): Promise<boolean> =>
  fs.access(p).then(
    () => true,
    () => false
  )

const message = (err: unknown): string => (err instanceof Error ? err.message : 'Error desconocido')

/** Recorre el workspace y devuelve los JSON que van en el backup (ignora enlaces simbólicos) */
async function collectFiles(root: string): Promise<BackupFile[]> {
  const out: BackupFile[] = []

  const walk = async (rel: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return
    const dir = rel ? join(root, rel) : root
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue
        if (childRel === '.sonda/trash') continue
        await walk(childRel, depth + 1)
      } else if (entry.isFile() && isBackupPath(childRel)) {
        const abs = join(root, childRel)
        if ((await fs.stat(abs)).size > MAX_FILE_BYTES) continue
        out.push({ path: childRel, content: await fs.readFile(abs, 'utf-8') })
      }
    }
  }

  await walk('', 0)
  return out
}

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:export', async (): Promise<ExportResult | null> => {
    try {
      const files = await collectFiles(getWorkspacePath())
      if (files.length === 0) throw new Error('El workspace no tiene nada que respaldar')

      const today = new Date().toISOString().slice(0, 10)
      const picked = await dialog.showSaveDialog({
        title: 'Guardar backup del workspace',
        defaultPath: join(app.getPath('documents'), `sonda-backup-${today}.json`),
        filters: [{ name: 'Backup de Sonda', extensions: ['json'] }]
      })
      if (picked.canceled || !picked.filePath) return null

      await fs.writeFile(picked.filePath, buildBackup(files, new Date()), 'utf-8')
      return { ok: true, path: picked.filePath, count: files.length }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('backup:restore', async (): Promise<RestoreResult | null> => {
    const picked = await dialog.showOpenDialog({
      title: 'Restaurar backup del workspace',
      properties: ['openFile'],
      filters: [{ name: 'Backup de Sonda', extensions: ['json'] }]
    })
    if (picked.canceled || !picked.filePaths[0]) return null

    try {
      const source = picked.filePaths[0]
      if ((await fs.stat(source)).size > MAX_BACKUP_BYTES)
        throw new Error('El backup es demasiado grande')
      const { files, ignored } = parseBackup(await fs.readFile(source, 'utf-8'))

      // Defensa extra: nada se escribe fuera del workspace
      const root = resolve(getWorkspacePath())
      const inside = files.filter((f) => resolve(root, f.path).startsWith(root + sep))

      const present = await Promise.all(
        inside.map(async (f) => ((await exists(resolve(root, f.path))) ? f.path : null))
      )
      const { write, skipped } = planRestore(
        inside,
        new Set(present.filter((p): p is string => p !== null))
      )

      let restored = 0
      let late = 0
      for (const f of write) {
        const abs = resolve(root, f.path)
        await fs.mkdir(dirname(abs), { recursive: true })
        try {
          // "wx": si el archivo apareció mientras tanto, no se pisa
          await fs.writeFile(abs, f.content, { encoding: 'utf-8', flag: 'wx' })
          restored++
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
          late++
        }
      }

      return {
        ok: true,
        restored,
        skipped: skipped + late + (files.length - inside.length),
        ignored
      }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })
}
