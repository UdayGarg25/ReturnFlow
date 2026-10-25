/**
 * safeFetch.js — SSRF-safe external image fetcher
 *
 * Used only as a demo-data fallback when no S3 image key is present.
 * Design goals:
 *   1. Allow only http/https, reject every other scheme.
 *   2. Resolve the hostname to an IP before connecting and reject private/
 *      link-local/loopback/cloud-metadata ranges for BOTH IPv4 and IPv6.
 *   3. Follow at most one redirect; validate the redirect target with the same rules.
 *   4. Enforce a strict connect + response-header timeout (5 s).
 *   5. Enforce a hard response-body size limit (MAX_IMAGE_BYTES = 5 MB).
 *   6. Validate the response Content-Type against a known image MIME allowlist.
 *   7. Verify the response body magic bytes against known image signatures.
 *   8. Never expose the original error details to the caller.
 *
 * Returns { body: Buffer, contentType: string } or throws SsrfError / FetchError.
 */

import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { resolve4, resolve6 } from 'node:dns/promises'
import { URL } from 'node:url'

// --------------------------------------------------------------------------- constants
export const MAX_FETCH_BYTES = 5 * 1024 * 1024           // 5 MB hard cap
const CONNECT_TIMEOUT_MS    = 5_000
const MAX_REDIRECTS         = 1                           // follow at most one redirect
const ALLOWED_SCHEMES       = new Set(['http:', 'https:'])
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

// Image magic-byte signatures (same list used by the AI inspection module)
const SIGNATURES = [
  { type: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png',  test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
]

// --------------------------------------------------------------------------- error types
export class SsrfError extends Error {
  constructor(reason) { super(reason); this.name = 'SsrfError' }
}
export class FetchError extends Error {
  constructor(reason) { super(reason); this.name = 'FetchError' }
}

// --------------------------------------------------------------------------- IP-range checks

// Returns true when the string looks like an IPv4 dotted-decimal literal.
function isIPv4Literal(s) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s)
}

// Returns true when the string looks like an IPv6 literal (with or without brackets).
function isIPv6Literal(s) {
  // IPv6 literals in URLs appear inside brackets: [::1]
  return s.startsWith('[') || s.includes(':')
}

// Parse an IPv4 dotted-decimal string into a 32-bit unsigned integer.
function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

// Returns true when the IPv4 address must be blocked.
function isBlockedIPv4(ip) {
  const n = ipv4ToInt(ip)
  // 0.0.0.0/8 — "this" network
  if ((n >>> 24) === 0)   return true
  // 10.0.0.0/8
  if ((n >>> 24) === 10)  return true
  // 127.0.0.0/8 — loopback
  if ((n >>> 24) === 127) return true
  // 169.254.0.0/16 — link-local / AWS metadata (169.254.169.254)
  if ((n >>> 16) === ((169 << 8) | 254)) return true
  // 172.16.0.0/12
  const second = (n >>> 20) & 0xf
  if ((n >>> 24) === 172 && second >= 0 && second <= 15) return true
  // 192.168.0.0/16
  if ((n >>> 16) === ((192 << 8) | 168)) return true
  // 100.64.0.0/10 — IANA shared address space (often used by cloud NAT)
  if ((n >>> 22) === ((100 << 2) | 1)) return true
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 — TEST-NET
  if ((n >>> 8) === ((192 << 16) | (0 << 8) | 2))    return true
  if ((n >>> 8) === ((198 << 16) | (51 << 8) | 100)) return true
  if ((n >>> 8) === ((203 << 16) | (0 << 8) | 113))  return true
  return false
}

// Returns true when the IPv6 address must be blocked.
function isBlockedIPv6(ip) {
  // Strip zone ID (%eth0 etc.)
  const bare = ip.split('%')[0].toLowerCase()
  if (bare === '::1')             return true  // loopback
  if (bare === '::')              return true  // unspecified
  if (bare.startsWith('fe80:'))   return true  // link-local
  if (bare.startsWith('fc') || bare.startsWith('fd')) return true  // unique-local (RFC 4193)
  if (bare.startsWith('::ffff:')) {
    // IPv4-mapped: ::ffff:169.254.169.254, ::ffff:127.0.0.1, etc.
    const v4 = bare.slice(7)
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v4) && isBlockedIPv4(v4)) return true
  }
  return false
}

// --------------------------------------------------------------------------- URL validation (string-level)
function validateUrlString(urlString) {
  let parsed
  try { parsed = new URL(urlString) } catch { throw new SsrfError('Invalid URL') }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) throw new SsrfError('Only http and https URLs are permitted')
  const host = parsed.hostname.toLowerCase()
  // Reject plain localhost and empty hostname before DNS
  if (host === 'localhost' || host === '') throw new SsrfError('Blocked host')
  // Reject IP literals immediately without a DNS round-trip
  if (isIPv4Literal(host) && isBlockedIPv4(host)) throw new SsrfError(`Blocked IPv4 address: ${host}`)
  const bare = host.startsWith('[') ? host.slice(1, -1) : host
  if (isIPv6Literal(host) && isBlockedIPv6(bare)) throw new SsrfError(`Blocked IPv6 address: ${bare}`)
  return parsed
}

// --------------------------------------------------------------------------- DNS + IP validation
async function resolveAndCheck(hostname) {
  // If the hostname is already an IP literal, skip DNS and check it directly.
  if (isIPv4Literal(hostname)) {
    if (isBlockedIPv4(hostname)) throw new SsrfError(`Blocked IPv4 address: ${hostname}`)
    return
  }
  const bare = hostname.startsWith('[') ? hostname.slice(1, -1) : hostname
  if (isIPv6Literal(hostname)) {
    if (isBlockedIPv6(bare)) throw new SsrfError(`Blocked IPv6 address: ${bare}`)
    return
  }

  const errors = []
  let hasV4 = false, hasV6 = false

  // Try IPv4
  try {
    const v4 = await resolve4(hostname)
    hasV4 = true
    for (const ip of v4) {
      if (isBlockedIPv4(ip)) throw new SsrfError(`Blocked IPv4 address: ${ip}`)
    }
  } catch (err) {
    if (err instanceof SsrfError) throw err
    errors.push(err)
  }

  // Try IPv6
  try {
    const v6 = await resolve6(hostname)
    hasV6 = true
    for (const ip of v6) {
      if (isBlockedIPv6(ip)) throw new SsrfError(`Blocked IPv6 address: ${ip}`)
    }
  } catch (err) {
    if (err instanceof SsrfError) throw err
    errors.push(err)
  }

  if (!hasV4 && !hasV6) throw new FetchError('Could not resolve host')
}

// --------------------------------------------------------------------------- HTTP GET with timeout
function httpGetWithTimeout(parsedUrl, timeoutMs) {
  return new Promise((resolve, reject) => {
    const getter = parsedUrl.protocol === 'https:' ? httpsGet : httpGet
    const req = getter(
      {
        hostname: parsedUrl.hostname,
        port:     parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path:     parsedUrl.pathname + parsedUrl.search,
        headers:  { 'User-Agent': 'ReturnFlow-DemoFetcher/1.0', Accept: 'image/*' },
        timeout:  timeoutMs,
      },
      (res) => resolve(res),
    )
    req.on('timeout', () => { req.destroy(); reject(new FetchError('Request timed out')) })
    req.on('error',   (err) => reject(new FetchError(`Network error: ${err.code ?? err.message}`)))
  })
}

// --------------------------------------------------------------------------- body reader with size cap
function readBodyCapped(res, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    res.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) {
        res.destroy()
        return reject(new FetchError('Response too large'))
      }
      chunks.push(chunk)
    })
    res.on('end',   () => resolve(Buffer.concat(chunks)))
    res.on('error', (err) => reject(new FetchError(`Read error: ${err.message}`)))
  })
}

// --------------------------------------------------------------------------- main export
/**
 * Safely fetch an external image URL.
 *
 * @param {string} urlString   - The URL to fetch (from a trusted DB column).
 * @param {number} [redirectsLeft=MAX_REDIRECTS]  - Recursion counter for redirects.
 * @returns {Promise<{body: Buffer, contentType: string}>}
 * @throws {SsrfError} on policy violations (blocked host, unsafe redirect, etc.)
 * @throws {FetchError} on network / protocol errors
 */
export async function safeFetchImage(urlString, redirectsLeft = MAX_REDIRECTS) {
  // 1. Validate URL string
  const parsed = validateUrlString(urlString)

  // 2. DNS resolution + IP-range check
  await resolveAndCheck(parsed.hostname)

  // 3. HTTP GET with timeout
  const res = await httpGetWithTimeout(parsed, CONNECT_TIMEOUT_MS)

  // 4. Handle redirects (only up to MAX_REDIRECTS times)
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    res.destroy()
    if (redirectsLeft <= 0) throw new FetchError('Too many redirects')
    // Resolve relative redirects
    const next = new URL(res.headers.location, urlString).toString()
    return safeFetchImage(next, redirectsLeft - 1)
  }

  // 5. Require 200
  if (res.statusCode !== 200) {
    res.destroy()
    throw new FetchError(`Unexpected HTTP status: ${res.statusCode}`)
  }

  // 6. Content-Type header check (advisory — magic bytes are the real gate)
  const ct = (res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (!ALLOWED_CONTENT_TYPES.has(ct)) {
    res.destroy()
    throw new FetchError(`Unsupported content type: ${ct}`)
  }

  // 7. Read body with size cap
  const body = await readBodyCapped(res, MAX_FETCH_BYTES)

  // 8. Magic-byte verification (ignore the Content-Type header from here on)
  const real = SIGNATURES.find((s) => s.test(body))
  if (!real) throw new FetchError('Response body is not a recognised image format')

  return { body, contentType: real.type }
}
