import { binaryExtensionFor } from '../../../shared/exportResponse'
import type { BinaryBody } from '../../../shared/types'

const isPreviewableImage = (contentType: string): boolean =>
  /^image\/(png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)$/i.test(contentType)

interface Props {
  binary: BinaryBody
  sizeLabel: string
  onDownload: () => void
}

export function BinaryView({ binary, sizeLabel, onDownload }: Props): React.JSX.Element {
  const hasData = binary.base64 !== ''
  const ext = binaryExtensionFor(binary.contentType)

  return (
    <div className="space-y-3 text-xs">
      {hasData && isPreviewableImage(binary.contentType) && (
        <div className="inline-block rounded border border-zinc-800 bg-zinc-900 p-2">
          <img
            src={`data:${binary.contentType};base64,${binary.base64}`}
            alt="Vista previa de la respuesta"
            className="max-h-[60vh] max-w-full object-contain"
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="font-mono text-zinc-300">
          {binary.contentType} · {sizeLabel}
        </span>
        {hasData ? (
          <button
            onClick={onDownload}
            className="rounded bg-blue-600 px-3 py-1 font-semibold text-white hover:bg-blue-500"
          >
            Descargar .{ext}
          </button>
        ) : (
          <span className="text-amber-400">
            {binary.truncated
              ? 'Supera el límite de 20 MB: no se puede mostrar ni descargar desde Sonda.'
              : 'El contenido no se conservó (por ejemplo, al abrirlo desde el historial). Envía la petición otra vez.'}
          </span>
        )}
      </div>
    </div>
  )
}
