import { describe, expect, it } from 'vitest'
import {
  buildGraphqlBody,
  GQL_INTROSPECTION_QUERY,
  operationTemplate,
  parseGraphqlBody,
  parseIntrospection,
  typeToString,
  type GqlOperation
} from './graphql'

const nonNull = (ofType: object): { kind: string; name: null; ofType: object } => ({
  kind: 'NON_NULL',
  name: null,
  ofType
})

const introspection = JSON.stringify({
  data: {
    __schema: {
      queryType: { name: 'Query' },
      mutationType: { name: 'Mutation' },
      types: [
        {
          name: 'Query',
          kind: 'OBJECT',
          fields: [
            {
              name: 'user',
              args: [{ name: 'id', type: nonNull({ kind: 'SCALAR', name: 'ID' }) }],
              type: { kind: 'OBJECT', name: 'User' }
            },
            { name: 'ping', args: [], type: nonNull({ kind: 'SCALAR', name: 'String' }) },
            { name: '__internal', args: [], type: { kind: 'SCALAR', name: 'String' } }
          ]
        },
        {
          name: 'Mutation',
          kind: 'OBJECT',
          fields: [
            {
              name: 'createUser',
              args: [{ name: 'input', type: nonNull({ kind: 'INPUT_OBJECT', name: 'UserInput' }) }],
              type: { kind: 'OBJECT', name: 'User' }
            }
          ]
        },
        { name: 'User', kind: 'OBJECT', fields: [] }
      ]
    }
  }
})

const parsed = (): GqlOperation[] => {
  const r = parseIntrospection(introspection)
  if (!r.ok) throw new Error(r.error)
  return r.operations
}

describe('typeToString', () => {
  it('escribe listas y no nulos como en GraphQL', () => {
    const t = nonNull({ kind: 'LIST', name: null, ofType: nonNull({ kind: 'SCALAR', name: 'ID' }) })
    expect(typeToString(t)).toBe('[ID!]!')
    expect(typeToString({ kind: 'SCALAR', name: 'Int' })).toBe('Int')
    expect(typeToString(null)).toBe('?')
  })
})

describe('parseIntrospection', () => {
  it('lista queries y mutations raíz, sin los campos internos', () => {
    const ops = parsed()
    expect(ops.map((o) => `${o.kind}:${o.name}`)).toEqual([
      'query:user',
      'query:ping',
      'mutation:createUser'
    ])
  })

  it('describe argumentos, retorno y si necesita selection set', () => {
    const [user, ping, create] = parsed()
    expect(user.args).toEqual([{ name: 'id', type: 'ID!', sample: '' }])
    expect(user.returns).toBe('User')
    expect(user.returnsObject).toBe(true)
    expect(ping.returns).toBe('String!')
    expect(ping.returnsObject).toBe(false)
    expect(create.args[0]).toEqual({ name: 'input', type: 'UserInput!', sample: {} })
  })

  it('explica los errores', () => {
    const noJson = parseIntrospection('<html>')
    expect(noJson.ok).toBe(false)

    const withError = parseIntrospection(
      JSON.stringify({ errors: [{ message: 'introspection is disabled' }] })
    )
    expect(withError.ok === false && withError.error).toContain('introspection is disabled')

    const empty = parseIntrospection(JSON.stringify({ data: {} }))
    expect(empty.ok === false && empty.error).toContain('introspección')
  })

  it('la consulta pide __schema', () => {
    expect(GQL_INTROSPECTION_QUERY).toContain('__schema')
  })
})

describe('operationTemplate', () => {
  it('declara variables, las pasa y agrega selection set a los objetos', () => {
    const [user] = parsed()
    const t = operationTemplate(user)
    expect(t.query).toBe('query User($id: ID!) {\n  user(id: $id) { __typename }\n}')
    expect(JSON.parse(t.variables)).toEqual({ id: '' })
  })

  it('sin argumentos ni objeto: no hay paréntesis, selection ni variables', () => {
    const [, ping] = parsed()
    const t = operationTemplate(ping)
    expect(t.query).toBe('query Ping {\n  ping\n}')
    expect(t.variables).toBe('')
  })

  it('las mutations usan la palabra mutation', () => {
    const create = parsed()[2]
    expect(operationTemplate(create).query.startsWith('mutation CreateUser(')).toBe(true)
  })
})

describe('buildGraphqlBody / parseGraphqlBody', () => {
  it('arma el JSON con query y variables', () => {
    const r = buildGraphqlBody('query { a }', '{"id": 1}')
    expect(r.ok && JSON.parse(r.body)).toEqual({ query: 'query { a }', variables: { id: 1 } })
  })

  it('omite las variables si están vacías', () => {
    const r1 = buildGraphqlBody('query { a }', '')
    const r2 = buildGraphqlBody('query { a }', '{}')
    expect(r1.ok && JSON.parse(r1.body)).toEqual({ query: 'query { a }' })
    expect(r2.ok && JSON.parse(r2.body)).toEqual({ query: 'query { a }' })
  })

  it('rechaza query vacía y variables inválidas', () => {
    expect(buildGraphqlBody('  ', '').ok).toBe(false)
    const bad = buildGraphqlBody('query { a }', '{"id":')
    expect(bad.ok === false && bad.error).toContain('Variables')
    const arr = buildGraphqlBody('query { a }', '[1]')
    expect(arr.ok === false && arr.error).toContain('objeto')
  })

  it('parseGraphqlBody es la operación inversa', () => {
    const built = buildGraphqlBody('query { a }', '{"id": 1}')
    if (!built.ok) throw new Error(built.error)
    const back = parseGraphqlBody(built.body)
    expect(back?.query).toBe('query { a }')
    expect(JSON.parse(back!.variables)).toEqual({ id: 1 })
  })

  it('parseGraphqlBody devuelve null si no es un body GraphQL', () => {
    expect(parseGraphqlBody('{"nombre":"x"}')).toBeNull()
    expect(parseGraphqlBody('no json')).toBeNull()
    expect(parseGraphqlBody('')).toBeNull()
  })
})
