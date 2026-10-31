import { useEffect, useRef, useState } from 'react'

export interface ToolItem {
  id: string
  label: string
  description: string
  onSelect: () => void
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
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 ${
          open ? 'bg-zinc-800' : ''
        }`}
      >
        Herramientas
        {indicator}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 max-h-[75vh] w-72 overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left hover:bg-zinc-800"
            >
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