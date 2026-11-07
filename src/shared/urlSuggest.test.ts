import { describe, expect, it } from 'vitest'
import { recentUrls } from './urlSuggest'

describe('recentUrls', () => {
  it('quita query y hash, y no repite URLs', () => {
    const out = recentUrls([
      { method: 'GET', url: 'https://a.com/x?token=abc' },
      { method: 'POST', url: 'https://a.com/x' },
      { method: 'GET', url: ' {{baseUrl}}/users#top ' }
    ])
    expect(out).toEqual([
      { url: 'https://a.com/x', method: 'GET' },
      { url: '{{baseUrl}}/users', method: 'GET' }
    ])
  })

  it('descarta URLs con credenciales y vacías', () => {
    const out = recentUrls([
      { method: 'GET', url: 'https://user:pass@a.com/priv' },
      { method: 'GET', url: '   ' },
      { method: 'GET', url: 'https://b.com/y' }
    ])
    expect(out.map((s) => s.url)).toEqual(['https://b.com/y'])
  })

  it('respeta el límite', () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      method: 'GET' as const,
      url: `https://a.com/${i}`
    }))
    expect(recentUrls(entries, 3)).toHaveLength(3)
  })
})
