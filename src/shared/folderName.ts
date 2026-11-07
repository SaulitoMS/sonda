export type FolderNameCheck = { ok: true; name: string } | { ok: false; error: string }

const MAX_LENGTH = 80
/** Nombres que Windows no permite como archivo o carpeta (el workspace puede viajar por Git) */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Valida el nombre de una carpeta: legible y válido en macOS, Linux y Windows */
export function validateFolderName(raw: string): FolderNameCheck {
  const name = raw.trim()
  if (!name) return { ok: false, error: 'El nombre no puede estar vacío' }
  if (name.length > MAX_LENGTH) {
    return { ok: false, error: `El nombre no puede pasar de ${MAX_LENGTH} caracteres` }
  }
  // eslint-disable-next-line no-control-regex
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name)) {
    return { ok: false, error: 'El nombre no puede incluir / \\ : * ? " < > |' }
  }
  if (name.startsWith('.') || name.endsWith('.')) {
    return { ok: false, error: 'El nombre no puede empezar ni terminar con punto' }
  }
  if (RESERVED.test(name)) return { ok: false, error: `"${name}" es un nombre reservado` }
  return { ok: true, name }
}
