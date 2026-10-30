import type { EditorEdit } from '../../../shared/jsonEditing'

/**
 * Aplica una edición al textarea conservando su historial de deshacer.
 * `fallback` se usa solo si el navegador rechaza execCommand.
 */
export function applyEdit(
  el: HTMLTextAreaElement,
  edit: EditorEdit,
  fallback: (value: string) => void
): void {
  const changesText = edit.from !== edit.to || edit.insert !== ''

  if (changesText) {
    el.setSelectionRange(edit.from, edit.to)
    const ok =
      edit.insert === ''
        ? document.execCommand('delete')
        : document.execCommand('insertText', false, edit.insert)

    if (!ok) {
      fallback(el.value.slice(0, edit.from) + edit.insert + el.value.slice(edit.to))
      // React vuelve a pintar el valor; el cursor se coloca justo después
      requestAnimationFrame(() => el.setSelectionRange(edit.selStart, edit.selEnd))
      return
    }
  }

  el.setSelectionRange(edit.selStart, edit.selEnd)
}
