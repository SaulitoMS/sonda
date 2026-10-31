import { useEffect, useRef } from 'react'
import { Icon } from './Icon'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}

export function Modal({ title, onClose, children, wide }: Props): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Al abrir, el foco entra al diálogo (salvo que un campo ya lo haya tomado con autoFocus)
  useEffect(() => {
    const el = panel.current
    if (el && !el.contains(document.activeElement)) el.focus()
  }, [])

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`anim-pop flex max-h-[92vh] w-full flex-col rounded-t-xl border border-zinc-700 bg-zinc-900 shadow-2xl outline-none sm:rounded-xl ${
          wide ? 'sm:w-[780px]' : 'sm:w-[480px]'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <h2 className="truncate text-sm font-bold text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            title="Cerrar (Esc)"
            aria-label="Cerrar"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}