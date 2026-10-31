import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'

export interface ToolItem {
  id: string
  label: string
  description: string
  onSelect: () => void
  /** Icono a la izquierda */
  icon?: IconName
  /** Indicador a la derecha (ej: el punto del monitor) */
  badge?: React.ReactNode
}

interface Props {
  items: ToolItem[]
  /** Indicador junto al botón, visible con el menú cerrado */
  indicator?: React.ReactNode
}

export function ToolsMenu({ items, indicator }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Herramientas"
        className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 ${
          open ? 'bg-zinc-800' : ''
        }`}
      >
        <Icon name="sliders" size={15} />
        <span className="hidden md:inline">Herramientas</span>
        {indicator}
        <Icon
          name="chevronDown"
          size={11}
          className={`hidden transition-transform md:block ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="anim-pop absolute right-0 top-full z-40 mt-1 max-h-[75vh] w-72 max-w-[calc(100vw-1rem)] origin-top-right overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl"
        >
          {items.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-800"
            >
              {item.icon && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-blue-400">
                  <Icon name={item.icon} size={16} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-zinc-100">{item.label}</span>
                <span className="block text-[11px] leading-snug text-zinc-500">
                  {item.description}
                </span>
              </span>
              {item.badge}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}