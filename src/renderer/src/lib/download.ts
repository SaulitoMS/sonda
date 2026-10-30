function saveBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Descarga un texto como archivo: Electron muestra el diálogo nativo de "Guardar como" */
export function downloadText(fileName: string, content: string, mime: string): void {
  saveBlob(fileName, new Blob([content], { type: `${mime};charset=utf-8` }))
}

/** Descarga un archivo binario que llegó en base64 */
export function downloadBase64(fileName: string, base64: string, mime: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  saveBlob(fileName, new Blob([bytes], { type: mime }))
}