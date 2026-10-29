import { useEffect } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}

export function Modal({ title, onClose, children, wide }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={onClose}
    >
      <div
        className={`${wide ? 'w-[780px]' : 'w-[480px]'} max-w-[92vw] rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-bold text-zinc-100">{title}</h2>
        {children}
      </div>
    </div>
  )
}
