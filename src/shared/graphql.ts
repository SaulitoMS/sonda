/** Consulta de introspección mínima: solo lo necesario para listar operaciones raíz */
export const GQL_INTROSPECTION_QUERY =
  'query IntrospectionQuery { __schema { queryType { name } mutationType { name } types { name kind fields { name args { name type { ...TypeRef } } type { ...TypeRef } } } } } fragment TypeRef on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }'

interface TypeRef {
  kind?: string
  name?: string | null
  ofType?: TypeRef | null
}

export interface GqlArg {
  name: string
  /** Tipo tal como se escribe en GraphQL: [ID!]! */
  type: string
  /** Valor de ejemplo para el JSON de variables */
  sample: unknown
}

export interface GqlOperation {
  kind: 'query' | 'mutation'
  name: string
  args: GqlArg[]
  /** Tipo de retorno, ej: User! */
  returns: string
  /** Si devuelve un objeto, la query necesita un selection set */
  returnsObject: boolean
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function typeToString(t: TypeRef | null | undefined): string {
  if (!t) return '?'
  if (t.kind === 'NON_NULL') return `${typeToString(t.ofType)}!`
  if (t.kind === 'LIST') return `[${typeToString(t.ofType)}]`
  return t.name ?? '?'
}

function unwrap(t: TypeRef | null | undefined): TypeRef | null {
  let cur = t
  while (cur && (cur.kind === 'NON_NULL' || cur.kind === 'LIST')) cur = cur.ofType
  return cur ?? null
}

function sampleFor(t: TypeRef | null | undefined): unknown {
  let cur = t
  while (cur?.kind === 'NON_NULL') cur = cur.ofType
  if (cur?.kind === 'LIST') return []
  switch (cur?.name) {
    case 'Int':
    case 'Float':
      return 0
    case 'Boolean':
      return false
    case 'String':
    case 'ID':
      return ''
  }
  return cur?.kind === 'INPUT_OBJECT' ? {} : null
}

type ParsedSchema = { ok: true; operations: GqlOperation[] } | { ok: false; error: string }

/** Extrae las queries y mutations raíz de la respuesta de introspección */
export function parseIntrospection(text: string): ParsedSchema {
  const fail = (error: string): ParsedSchema => ({ ok: false, error })

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return fail('La respuesta no es JSON. ¿La URL es un endpoint GraphQL?')
  }
  if (!isObj(json)) return fail('La respuesta no tiene el formato esperado.')

  const schema = isObj(json.data) && isObj(json.data.__schema) ? json.data.__schema : null
  if (!schema) {
    const first = Array.isArray(json.errors) ? json.errors[0] : null
    const message = isObj(first) && typeof first.message === 'string' ? first.message : ''
    return fail(
      message
        ? `El servidor respondió con un error: ${message}`
        : 'La respuesta no incluye __schema (¿la introspección está desactivada?).'
    )
  }

  const types = Array.isArray(schema.types) ? schema.types.filter(isObj) : []
  const byName = new Map(types.map((t) => [String(t.name), t]))
  const operations: GqlOperation[] = []

  for (const kind of ['query', 'mutation'] as const) {
    const rootRef = schema[kind === 'query' ? 'queryType' : 'mutationType']
    const rootName = isObj(rootRef) && typeof rootRef.name === 'string' ? rootRef.name : null
    const root = rootName ? byName.get(rootName) : undefined
    const fields = root && Array.isArray(root.fields) ? root.fields.filter(isObj) : []

    for (const f of fields) {
      if (typeof f.name !== 'string' || f.name.startsWith('__')) continue
      const returnType = f.type as TypeRef
      const base = unwrap(returnType)
      operations.push({
        kind,
        name: f.name,
        args: (Array.isArray(f.args) ? f.args.filter(isObj) : []).map((a) => ({
          name: String(a.name),
          type: typeToString(a.type as TypeRef),
          sample: sampleFor(a.type as TypeRef)
        })),
        returns: typeToString(returnType),
        returnsObject: ['OBJECT', 'INTERFACE', 'UNION'].includes(base?.kind ?? '')
      })
    }
  }
  return { ok: true, operations }
}

/** Query y variables de partida para una operación del schema */
export function operationTemplate(op: GqlOperation): { query: string; variables: string } {
  const title = op.name.charAt(0).toUpperCase() + op.name.slice(1)
  const declared = op.args.map((a) => `$${a.name}: ${a.type}`).join(', ')
  const passed = op.args.map((a) => `${a.name}: $${a.name}`).join(', ')
  const selection = op.returnsObject ? ' { __typename }' : ''

  return {
    query: `${op.kind} ${title}${declared ? `(${declared})` : ''} {\n  ${op.name}${passed ? `(${passed})` : ''}${selection}\n}`,
    variables: op.args.length
      ? JSON.stringify(Object.fromEntries(op.args.map((a) => [a.name, a.sample])), null, 2)
      : ''
  }
}

/** Si el body actual ya es un {query, variables}, devuelve sus partes para editarlas */
export function parseGraphqlBody(body: string): { query: string; variables: string } | null {
  try {
    const json: unknown = JSON.parse(body)
    if (!isObj(json) || typeof json.query !== 'string') return null
    const variables =
      isObj(json.variables) && Object.keys(json.variables).length > 0
        ? JSON.stringify(json.variables, null, 2)
        : ''
    return { query: json.query, variables }
  } catch {
    return null
  }
}

export function buildGraphqlBody(
  query: string,
  variablesText: string
): { ok: true; body: string } | { ok: false; error: string } {
  if (!query.trim()) return { ok: false, error: 'Escribe una query.' }

  let variables: Record<string, unknown> | undefined
  const text = variablesText.trim()
  if (text) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      return {
        ok: false,
        error: `Variables: JSON inválido (${err instanceof Error ? err.message : 'error'}).`
      }
    }
    if (!isObj(parsed)) return { ok: false, error: 'Las variables deben ser un objeto JSON.' }
    variables = parsed
  }

  const payload = variables && Object.keys(variables).length > 0 ? { query, variables } : { query }
  return { ok: true, body: JSON.stringify(payload, null, 2) }
}
