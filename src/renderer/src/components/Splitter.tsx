interface Props {
  /** vertical: barra que se arrastra a izquierda/derecha · horizontal: a arriba/abajo */
  orientation: 'vertical' | 'horizontal'
  /** Posición del cursor (en la ventana) mientras se arrastra */
  onDrag: (clientX: number, clientY: number) => void
  /** Doble clic: volver al tamaño por defecto */
  onReset?: () => void
}

export function Splitter({ orientation, onDrag, onReset }: Props): React.JSX.Element {
  const vertical = orientation === 'vertical'

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    const move = (ev: MouseEvent): void => onDrag(ev.clientX, ev.clientY)
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.style.cursor = vertical ? 'col-resize' : 'row-resize'
  }

  return (
    // La línea visible mide 1px; el área para agarrarla es más ancha
    <div
      role="separator"
      aria-orientation={orientation}
      className={`relative shrink-0 bg-zinc-800 ${vertical ? 'w-px' : 'h-px'}`}
    >
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={onReset}
        title="Arrastra para cambiar el tamaño · doble clic para restablecer"
        className={`absolute z-10 transition-colors hover:bg-blue-500/50 active:bg-blue-500/70 ${
          vertical
            ? '-inset-x-1 inset-y-0 cursor-col-resize'
            : '-inset-y-1 inset-x-0 cursor-row-resize'
        }`}
      />
    </div>
  )
}
