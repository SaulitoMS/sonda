/**
 * Genera interfaces de TypeScript a partir de un JSON de ejemplo.
 * Junta todos los elementos de un array: los campos que no aparecen en todos
 * quedan opcionales (`?`) y los tipos distintos se combinan con `|`.
 */
type Shape =
  | { kind: 'prim'; name: string }
  | { kind: 'array'; item: Shape | null }
  | { kind: 'object'; props: Map<string, { shape: Shape; optional: boolean }> }
  | { kind: 'union'; parts: Shape[] }

interface Ctx {
  out: string[]
  used: Set<string>
}

function infer(v: unknown): Shape {
  if (v === null) return { kind: 'prim', name: 'null' }
  if (Array.isArray(v)) {
    return { kind: 'array', item: v.length ? v.map(infer).reduce(join) : null }
  }
  switch (typeof v) {
    case 'string':
    case 'number':
    case 'boolean':
      return { kind: 'prim', name: typeof v }
    case 'object': {
      const props = new Map<string, { shape: Shape; optional: boolean }>()
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        props.set(k, { shape: infer(val), optional: false })
      }
      return { kind: 'object', props }
    }
    default:
      return { kind: 'prim', name: 'unknown' }
  }
}

function mergeSame(a: Shape, b: Shape): Shape {
  if (a.kind === 'object' && b.kind === 'object') {
    const props = new Map<string, { shape: Shape; optional: boolean }>()
    for (const [k, p] of a.props) {
      const q = b.props.get(k)
      props.set(
        k,
        q
          ? { shape: join(p.shape, q.shape), optional: p.optional || q.optional }
          : { shape: p.shape, optional: true }
      )
    }
    for (const [k, q] of b.props) {
      if (!a.props.has(k)) props.set(k, { shape: q.shape, optional: true })
    }
    return { kind: 'object', props }
  }
  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', item: a.item && b.item ? join(a.item, b.item) : (a.item ?? b.item) }
  }
  return a
}

function join(a: Shape, b: Shape): Shape {
  const parts = [...(a.kind === 'union' ? a.parts : [a]), ...(b.kind === 'union' ? b.parts : [b])]
  const out: Shape[] = []
  for (const p of parts) {
    const i = out.findIndex(
      (o) => o.kind === p.kind && (o.kind !== 'prim' || (p.kind === 'prim' && o.name === p.name))
    )
    if (i === -1) out.push(p)
    else out[i] = mergeSame(out[i], p)
  }
  return out.length === 1 ? out[0] : { kind: 'union', parts: out }
}

function pascal(s: string): string {
  const name = s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')
  return /^[A-Za-z]/.test(name) ? name : `T${name}`
}

function singular(name: string): string {
  const s = name.replace(/ies$/, 'y').replace(/s$/, '')
  return s && s !== name ? s : `${name}Item`
}

function uniqueName(hint: string, ctx: Ctx): string {
  const base = pascal(hint)
  let name = base
  for (let i = 2; ctx.used.has(name); i++) name = `${base}${i}`
  ctx.used.add(name)
  return name
}

const IDENT = /^[A-Za-z_$][\w$]*$/

function typeOf(s: Shape, hint: string, ctx: Ctx): string {
  switch (s.kind) {
    case 'prim':
      return s.name
    case 'array': {
      if (!s.item) return 'unknown[]'
      const t = typeOf(s.item, singular(hint), ctx)
      return t.includes(' | ') ? `(${t})[]` : `${t}[]`
    }
    case 'union':
      return s.parts
        .map((p) => typeOf(p, hint, ctx))
        .sort((a, b) => Number(a === 'null') - Number(b === 'null'))
        .join(' | ')
    case 'object': {
      if (s.props.size === 0) return 'Record<string, unknown>'
      const name = uniqueName(hint, ctx)
      const slot = ctx.out.length
      ctx.out.push('') // el padre va antes que sus hijos
      const lines = [...s.props].map(([k, p]) => {
        const key = IDENT.test(k) ? k : JSON.stringify(k)
        return `  ${key}${p.optional ? '?' : ''}: ${typeOf(p.shape, k, ctx)}`
      })
      ctx.out[slot] = `export interface ${name} {\n${lines.join('\n')}\n}`
      return name
    }
  }
}

export function jsonToTypeScript(value: unknown, rootName = 'Respuesta'): string {
  const ctx: Ctx = { out: [], used: new Set() }
  const shape = infer(value)
  const t = typeOf(shape, rootName, ctx)
  if (shape.kind !== 'object' || shape.props.size === 0) {
    ctx.out.unshift(`export type ${pascal(rootName)} = ${t}`)
  }
  return ctx.out.join('\n\n')
}