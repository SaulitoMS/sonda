import { useEffect, useRef } from 'react'
import { Icon, type IconName } from './Icon'

/** Icono automático según el título, para que ningún modal tenga que pedirlo */
const TITLE_ICONS: [RegExp, IconName][] = [
  [/importar/, 'download'],
  [/guardar/, 'save'],
  [/entorno/, 'globe'],
  [/cookie/, 'cookie'],
  [/historial/, 'history'],
  [/papelera/, 'trash'],
  [/ajuste/, 'settings'],
  [/atajo|curl/, 'terminal'],
  [/websocket|monitor|salud/, 'activity'],
  [/mock/, 'server'],
  [/rendimiento/, 'gauge'],
  [/fuzz/, 'bug'],
  [/linea base/, 'camera'],
  [/polling/, 'clock'],
  [/ejecutar/, 'play'],
  [/cobertura/, 'checkCircle'],
  [/variable|graphql/, 'braces'],
  [/reemplazar/, 'search'],
  [/comparar/, 'gitCompare'],
  [/autenticacion|auth/, 'key'],
  [/header/, 'list'],
  [/script/, 'fileCode'],
  [/caja/, 'sliders']
]

const iconFor = (title: string): IconName => {
  const t = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return TITLE_ICONS.find(([re]) => re.test(t))?.[1] ?? 'zap'
}

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
  /** Icono del encabezado (si no se da, se deduce del título) */
  icon?: IconName
  /** Línea gris bajo el título */
  description?: string
  /** Barra inferior fija con las acciones (Cancelar / Guardar…) */
  footer?: React.ReactNode
}

export function Modal({
  title,
  onClose,
  children,
  wide,
  icon,
  description,
  footer
}: Props): React.JSX.Element {
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
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`anim-pop flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-700/70 bg-zinc-900 shadow-2xl outline-none sm:rounded-2xl ${
          wide ? 'sm:w-[820px]' : 'sm:w-[500px]'
        }`}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-linear-to-b from-zinc-950/60 to-transparent px-5 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20">
            <Icon name={icon ?? iconFor(title)} size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-zinc-100">{title}</h2>
            {description && <p className="truncate text-xs text-zinc-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            title="Cerrar (Esc)"
            aria-label="Cerrar"
          >
            <kbd className="hidden rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] sm:inline">
              Esc
            </kbd>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950/40 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}