// Estilos que cambian cómo se acomoda el texto: el espejo debe tenerlos idénticos
const COPIED_PROPS = [
  'box-sizing',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'font-style',
  'font-variant',
  'font-weight',
  'font-stretch',
  'font-size',
  'line-height',
  'font-family',
  'text-align',
  'text-transform',
  'text-indent',
  'letter-spacing',
  'word-spacing',
  'tab-size',
  'overflow-wrap',
  'word-break'
] as const

export interface CaretPosition {
  left: number
  top: number
  /** Parte baja de la línea del cursor */
  bottom: number
}

/** Coordenadas (de pantalla) del cursor en la posición `index` de un textarea */
export function caretPosition(el: HTMLTextAreaElement, index: number): CaretPosition {
  const style = getComputedStyle(el)
  const borderLeft = parseFloat(style.borderLeftWidth) || 0
  const borderTop = parseFloat(style.borderTopWidth) || 0
  const borderRight = parseFloat(style.borderRightWidth) || 0

  // Un div invisible con el mismo texto y estilos: donde termina el texto está el cursor
  const mirror = document.createElement('div')
  for (const prop of COPIED_PROPS) mirror.style.setProperty(prop, style.getPropertyValue(prop))
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'
  mirror.style.overflow = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  // clientWidth no cuenta la barra de scroll, igual que el área donde se acomoda el texto
  mirror.style.width = `${el.clientWidth + borderLeft + borderRight}px`

  mirror.textContent = el.value.slice(0, index)
  const marker = document.createElement('span')
  marker.textContent = el.value.slice(index) || '.'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)

  const box = el.getBoundingClientRect()
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2
  const left = box.left + borderLeft + marker.offsetLeft - el.scrollLeft
  const top = box.top + borderTop + marker.offsetTop - el.scrollTop

  document.body.removeChild(mirror)
  return { left, top, bottom: top + lineHeight }
}
