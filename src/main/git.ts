import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'
import {
  parseGitStatus,
  type GitActionResult,
  type GitCommit,
  type GitStatusResult
} from '../shared/git'
import { getWorkspacePath } from './settings'

/** La papelera es local a esta computadora: no tiene sentido versionarla */
const GITIGNORE = '# Sonda: papelera local, no se versiona\n.sonda/trash/\n'

type GitOutput =
  { ok: true; stdout: string } | { ok: false; notInstalled: boolean; message: string }

function git(args: string[], cwd: string): Promise<GitOutput> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: 15_000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      },
      (err, stdout, stderr) => {
        if (err) {
          const code = (err as { code?: unknown }).code
          resolve({
            ok: false,
            notInstalled: code === 'ENOENT',
            message: (String(stderr) || String(stdout) || err.message).trim()
          })
          return
        }
        resolve({ ok: true, stdout: String(stdout) })
      }
    )
  })
}

/** El workspace tiene que existir antes de usarlo como cwd (si no, ENOENT parecería "git no instalado") */
async function workspace(): Promise<string> {
  const root = getWorkspacePath()
  await fs.mkdir(root, { recursive: true })
  return root
}

const samePath = (a: string, b: string): boolean =>
  process.platform === 'linux' ? a === b : a.toLowerCase() === b.toLowerCase()

async function status(): Promise<GitStatusResult> {
  const root = await workspace()

  const top = await git(['rev-parse', '--show-toplevel'], root)
  if (!top.ok) {
    if (top.notInstalled) return { ok: true, state: 'no-git' }
    if (/dubious ownership/i.test(top.message)) return { ok: false, error: top.message }
    return { ok: true, state: 'no-repo' }
  }

  // Si la carpeta está dentro de otro repositorio (ej: Documentos), no es el repo de Sonda
  const [a, b] = await Promise.all([fs.realpath(root), fs.realpath(top.stdout.trim())])
  if (!samePath(a, b)) return { ok: true, state: 'no-repo' }

  const st = await git(
    ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '-b', '-uall'],
    root
  )
  if (!st.ok) return { ok: false, error: st.message }

  // Sin commits todavía, `git log` falla: no es un error
  const log = await git(['log', '-8', '--pretty=format:%h%x1f%s%x1f%ct'], root)
  const commits: GitCommit[] = log.ok
    ? log.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, subject, ts] = line.split('\x1f')
          return { hash, subject, date: Number(ts) * 1000 }
        })
    : []

  return { ok: true, state: 'repo', status: parseGitStatus(st.stdout), commits }
}

export function registerGitHandlers(): void {
  ipcMain.handle('git:status', async (): Promise<GitStatusResult> => {
    try {
      return await status()
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  })

  ipcMain.handle('git:init', async (): Promise<GitActionResult> => {
    try {
      const root = await workspace()
      const res = await git(['init'], root)
      if (!res.ok) return { ok: false, error: res.message }
      // "wx": solo se crea si no existía, para no pisar el .gitignore de nadie
      await fs.writeFile(join(root, '.gitignore'), GITIGNORE, { flag: 'wx' }).catch(() => undefined)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  })

  ipcMain.handle('git:commit', async (_e, message: string): Promise<GitActionResult> => {
    try {
      const msg = String(message ?? '').trim()
      if (!msg) return { ok: false, error: 'Escribe un mensaje para el commit' }
      if (msg.length > 500) return { ok: false, error: 'El mensaje es demasiado largo (máx. 500)' }

      const root = await workspace()
      const add = await git(['add', '-A'], root)
      if (!add.ok) return { ok: false, error: add.message }

      const commit = await git(['commit', '-m', msg], root)
      if (!commit.ok) {
        if (/nothing to commit/i.test(commit.message)) {
          return { ok: false, error: 'No hay cambios para guardar' }
        }
        const needsIdentity = /tell me who you are|user\.(?:name|email)/i.test(commit.message)
        return {
          ok: false,
          error: needsIdentity
            ? 'Git no sabe quién eres. En una terminal ejecuta:\n' +
              'git config --global user.name "Tu Nombre"\n' +
              'git config --global user.email "tu@correo.com"'
            : commit.message
        }
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
    }
  })
}
