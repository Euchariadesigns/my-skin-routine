import { describe, expect, it } from 'vitest'
import { b64u, encryptPayload, generateVapidKeys, importVapid, unb64u, vapidToken } from './webpush'

// The worked example in RFC 8291, section 5.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

async function rfcKeys(): Promise<CryptoKeyPair> {
  const pub = unb64u(RFC.asPublic)
  const jwk = { kty: 'EC', crv: 'P-256', d: RFC.asPrivate, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true }
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const publicKey = await crypto.subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
  return { privateKey, publicKey }
}

describe('web push', () => {
  it('encrypts exactly like the RFC 8291 example', async () => {
    const body = await encryptPayload(new TextEncoder().encode(RFC.plaintext), RFC.uaPublic, RFC.authSecret, {
      salt: unb64u(RFC.salt),
      keys: await rfcKeys(),
    })
    expect(b64u(body)).toBe(RFC.body)
  })

  it('signs a VAPID token the public key can verify', async () => {
    const stored = await generateVapidKeys()
    const vapid = await importVapid(stored, 'https://example.com')
    const token = await vapidToken(vapid, 'https://web.push.apple.com', 1_700_000_000_000)
    const [h, c, s] = token.split('.')
    expect(JSON.parse(new TextDecoder().decode(unb64u(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(unb64u(c)))).toEqual({ aud: 'https://web.push.apple.com', exp: 1_700_000_000 + 43_200, sub: 'https://example.com' })
    const pub = await crypto.subtle.importKey('raw', unb64u(stored.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(s), new TextEncoder().encode(`${h}.${c}`))
    expect(ok).toBe(true)
    expect(unb64u(stored.publicKey).length).toBe(65)
  })
})
