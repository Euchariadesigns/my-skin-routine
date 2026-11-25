/*
 * Web Push, written with the Web Crypto API only.
 * - VAPID (RFC 8292) proves to the phone's push service that the message comes from us.
 * - aes128gcm (RFC 8291 and RFC 8188) encrypts the message so only that phone can read it.
 */

type Bytes = Uint8Array<ArrayBuffer>

const enc = new TextEncoder()
/** Text as bytes on a plain ArrayBuffer, which Web Crypto wants. */
const text = (s: string): Bytes => concat(enc.encode(s))

export function b64u(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function unb64u(s: string): Bytes {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** Encrypts `payload` for one phone, given the keys from its push subscription. */
export async function encryptPayload(
  payload: Uint8Array,
  p256dh: string,
  auth: string,
  fixed?: { salt: Bytes; keys: CryptoKeyPair },
): Promise<Bytes> {
  const uaPublic = unb64u(p256dh)
  const secret = unb64u(auth)
  const keys = fixed?.keys ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  // Cloudflare's types call this field `$public`; at run time it's the standard `public`.
  const ecdh = { name: 'ECDH', public: uaKey } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0]
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, keys.privateKey, 256))

  const ikm = await hkdf(secret, shared, concat(text('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, text('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, text('Content-Encoding: nonce\0'), 12)

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // One record, ending with the 0x02 delimiter.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))))

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, sealed)
}

/* ---------------- VAPID ---------------- */

export interface StoredVapidKeys {
  /** The uncompressed public key, base64url. Phones subscribe with this. */
  publicKey: string
  privateJwk: JsonWebKey
}

export async function generateVapidKeys(): Promise<StoredVapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
  const publicKey = b64u(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer)
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey
  return { publicKey, privateJwk }
}

export interface Vapid {
  publicKey: string
  privateKey: CryptoKey
  /** A way to reach whoever runs the server: an https URL or a mailto: address. */
  subject: string
}

export async function importVapid(stored: StoredVapidKeys, subject: string): Promise<Vapid> {
  const privateKey = await crypto.subtle.importKey('jwk', stored.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  return { publicKey: stored.publicKey, privateKey, subject }
}

/** A signed token for one push service, good for 12 hours. */
export async function vapidToken(vapid: Vapid, audience: string, now = Date.now()): Promise<string> {
  const header = b64u(text(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(text(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })))
  const unsigned = `${header}.${claims}`
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.privateKey, text(unsigned))
  return `${unsigned}.${b64u(signature)}`
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushOptions {
  /** How long the push service should keep trying, in seconds. */
  ttl: number
  urgency?: 'very-low' | 'low' | 'normal' | 'high'
  /** A newer message with the same topic replaces one that hasn't arrived yet. */
  topic?: string
}

/** Sends one encrypted message. A 404 or 410 means the subscription is gone for good. */
export async function sendPush(target: PushTarget, message: string, vapid: Vapid, opts: PushOptions): Promise<Response> {
  const body = await encryptPayload(text(message), target.p256dh, target.auth)
  const token = await vapidToken(vapid, new URL(target.endpoint).origin)
  const headers: Record<string, string> = {
    Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttl),
    Urgency: opts.urgency ?? 'normal',
  }
  if (opts.topic) headers.Topic = opts.topic
  return fetch(target.endpoint, { method: 'POST', headers, body })
}
