import { describe, expect, it } from 'vitest'
import { signAwsV4 } from './awsSigV4'

const base = {
  headers: [],
  body: '',
  accessKey: 'AKIDEXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'service',
  now: new Date('2015-08-30T12:36:00Z')
}

describe('signAwsV4', () => {
  it('coincide con el vector get-vanilla de AWS', async () => {
    const h = await signAwsV4({ ...base, method: 'GET', url: 'https://example.amazonaws.com/' })
    expect(h.find((x) => x.key === 'Authorization')?.value).toContain(
      'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31'
    )
  })

  it('ordena la query como pide AWS', async () => {
    const h = await signAwsV4({
      ...base,
      method: 'GET',
      url: 'https://example.amazonaws.com/?Param2=value2&Param1=value1'
    })
    expect(h.find((x) => x.key === 'Authorization')?.value).toContain(
      'Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500'
    )
  })
})
