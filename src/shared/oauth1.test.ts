import { describe, expect, it } from 'vitest'
import { signOAuth1, type OAuth1Input } from './oauth1'

// Ejemplo oficial de la documentación de Twitter (API v1.1) para firmar una petición
const twitter: OAuth1Input = {
  method: 'POST',
  url: 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
  headers: [{ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }],
  body: 'status=Hello%20Ladies%20%2B%20Gentlemen%2C%20a%20signed%20OAuth%20request%21',
  consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
  consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
  token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
  tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
  signatureMethod: 'HMAC-SHA1',
  nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
  timestamp: 1318622958
}

const header = async (input: OAuth1Input): Promise<string> => (await signOAuth1(input))[0].value

describe('signOAuth1', () => {
  it('reproduce la firma del ejemplo oficial', async () => {
    const value = await header(twitter)
    expect(value).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"')
    expect(value.startsWith('OAuth ')).toBe(true)
  })

  it('incluye los parámetros oauth_* en el header', async () => {
    const value = await header(twitter)
    expect(value).toContain('oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"')
    expect(value).toContain('oauth_signature_method="HMAC-SHA1"')
    expect(value).toContain('oauth_timestamp="1318622958"')
    expect(value).toContain('oauth_version="1.0"')
  })

  it('el body JSON no entra en la firma', async () => {
    const json = { ...twitter, headers: [{ key: 'Content-Type', value: 'application/json' }] }
    expect(await header(json)).not.toContain('hCtSmYh')
  })

  it('sin token no manda oauth_token', async () => {
    const value = await header({ ...twitter, token: '', tokenSecret: '' })
    expect(value).not.toContain('oauth_token')
  })

  it('PLAINTEXT usa las claves codificadas como firma', async () => {
    const value = await header({
      ...twitter,
      signatureMethod: 'PLAINTEXT',
      consumerSecret: 'a b',
      tokenSecret: 'c&d'
    })
    // "a%20b&c%26d" codificado otra vez dentro del header
    expect(value).toContain('oauth_signature="a%2520b%26c%2526d"')
  })

  it('HMAC-SHA256 cambia el método y la firma', async () => {
    const value = await header({ ...twitter, signatureMethod: 'HMAC-SHA256' })
    expect(value).toContain('oauth_signature_method="HMAC-SHA256"')
    expect(value).not.toContain('hCtSmYh')
  })

  it('agrega el realm al principio si existe', async () => {
    const value = await header({ ...twitter, realm: 'Ejemplo' })
    expect(value.startsWith('OAuth realm="Ejemplo", ')).toBe(true)
  })

  it('genera nonce y timestamp si no se fijan', async () => {
    const { nonce, timestamp, ...rest } = twitter
    void nonce
    void timestamp
    const a = await header(rest)
    const b = await header(rest)
    expect(a).not.toBe(b)
  })
})
