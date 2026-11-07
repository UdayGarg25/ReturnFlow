/**
 * safeFetch.js - SSRF-safe external image fetcher.
 *
 * Used only as a fallback when an image has no S3 key (demo data, and seller-supplied product image URLs). The URL
 * may be attacker-influenced (a seller types it), so every hop is checked:
 *   1. Only https (every hop, redirects included), no credentials in the URL, no "localhost" names.
 *   2. The connection is made to an address WE validated: a custom `lookup` resolves the name, checks EVERY returned
 *      address and hands only those to the socket. There is no second, unchecked resolution (no DNS-rebinding window),
 *      and the Host header / TLS server name / certificate check still use the real hostname.
 *   3. Addresses are parsed by node:net (BlockList), not by string prefixes. IPv4-mapped IPv6 (::ffff:a.b.c.d or its
 *      hex form), NAT64, 6to4, Teredo and everything outside global unicast 2000::/3 are refused for IPv6; private,
 *      loopback, link-local, CGNAT, multicast, reserved and test ranges are refused for IPv4.
 *   4. Redirects are followed manually (at most MAX_REDIRECTS), and each target goes through steps 1-3 again.
 *   5. Connect/idle timeout, a TOTAL deadline for the whole fetch (all redirects), a Content-Length pre-check and a
 *      hard streaming size cap.
 *   6. The Content-Type must be an image type AND the bytes must start with a known image signature.
 *
 * Returns { body: Buffer, contentType } or throws SsrfError (policy) / FetchError (network, size, format).
 */

import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { lookup as dnsLookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

// --------------------------------------------------------------------------- constants
export const MAX_FETCH_BYTES = 5 * 1024 * 1024 // 5 MB hard cap
export const IDLE_TIMEOUT_MS = 5_000 // connect + no-data timeout per socket
export const TOTAL_TIMEOUT_MS = 10_000 // whole fetch, including redirects
export const MAX_REDIRECTS = 3
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const SIGNATURES = [
  { type: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
]

// --------------------------------------------------------------------------- errors
export class SsrfError extends Error {
  constructor(reason) { super(reason); this.name = 'SsrfError' }
}
export class FetchError extends Error {
  constructor(reason) { super(reason); this.name = 'FetchError' }
}

// --------------------------------------------------------------------------- address policy
const BLOCKED_V4 = [
  ['0.0.0.0', 8], //        "this" network
  ['10.0.0.0', 8], //       private
  ['100.64.0.0', 10], //    carrier-grade NAT
  ['127.0.0.0', 8], //      loopback
  ['169.254.0.0', 16], //   link-local, cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], //    private
  ['192.0.0.0', 24], //     IETF protocol assignments
  ['192.0.2.0', 24], //     TEST-NET-1
  ['192.88.99.0', 24], //   6to4 relay (deprecated)
  ['192.168.0.0', 16], //   private
  ['198.18.0.0', 15], //    benchmarking
  ['198.51.100.0', 24], //  TEST-NET-2
  ['203.0.113.0', 24], //   TEST-NET-3
  ['224.0.0.0', 4], //      multicast
  ['240.0.0.0', 4], //      reserved + broadcast
]
const BLOCKED_V6 = [
  ['::', 96], //            unspecified, loopback and deprecated IPv4-compatible addresses
  ['64:ff9b::', 96], //     NAT64 (embeds an IPv4 address)
  ['64:ff9b:1::', 48], //   local-use NAT64
  ['100::', 64], //         discard-only
  ['2001::', 32], //        Teredo (embeds an IPv4 address)
  ['2001:db8::', 32], //    documentation
  ['2002::', 16], //        6to4 (embeds an IPv4 address)
  ['fc00::', 7], //         unique local
  ['fe80::', 10], //        link-local (fe80:: to febf::)
  ['fec0::', 10], //        site-local (deprecated)
  ['ff00::', 8], //         multicast
]
const blockedV4 = new BlockList()
for (const [net, prefix] of BLOCKED_V4) blockedV4.addSubnet(net, prefix, 'ipv4')
const blockedV6 = new BlockList()
for (const [net, prefix] of BLOCKED_V6) blockedV6.addSubnet(net, prefix, 'ipv6')
const globalUnicastV6 = new BlockList() // the only IPv6 space we ever connect to
globalUnicastV6.addSubnet('2000::', 3, 'ipv6')

// True when we must NOT connect to this address. Anything that is not a valid IP literal counts as blocked.
export function isBlockedAddress(address) {
  if (typeof address !== 'string') return true
  const ip = address.replace(/^\[|\]$/g, '').split('%')[0] // [::1] -> ::1, fe80::1%eth0 -> fe80::1
  const family = isIP(ip)
  if (family === 4) return blockedV4.check(ip, 'ipv4')
  if (family === 6) {
    // IPv4-mapped (::ffff:a.b.c.d / ::ffff:7f00:1) is outside 2000::/3, so it is refused here whatever it wraps.
    return !globalUnicastV6.check(ip, 'ipv6') || blockedV6.check(ip, 'ipv6')
  }
  return true
}

// --------------------------------------------------------------------------- URL validation
function parseAndCheckUrl(urlString, isBlocked, allowHttp) {
  let parsed
  try { parsed = new URL(urlString) } catch { throw new SsrfError('Invalid URL') }
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) throw new SsrfError('Only https URLs are permitted')
  if (parsed.username || parsed.password) throw new SsrfError('Credentials in URLs are not permitted')
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost')) throw new SsrfError('Blocked host')
  const literal = host.replace(/^\[|\]$/g, '')
  if (isIP(literal) && isBlocked(literal)) throw new SsrfError('Blocked address')
  return { parsed, literal: isIP(literal) ? literal : null }
}

// A `lookup` for http(s).get: resolves once, validates every address, and returns only validated ones.
// The socket connects to exactly what this returns, so a second DNS answer can never be used.
function makeLookup(resolver, isBlocked) {
  return (hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {} }
    Promise.resolve()
      .then(() => resolver(hostname, { all: true, verbatim: true }))
      .then((addresses) => {
        if (!Array.isArray(addresses) || addresses.length === 0) throw new FetchError('Could not resolve host')
        for (const a of addresses) if (isBlocked(a.address)) throw new SsrfError('Blocked address')
        if (options?.all) callback(null, addresses.map(({ address, family }) => ({ address, family })))
        else callback(null, addresses[0].address, addresses[0].family)
      })
      .catch((err) => callback(err instanceof SsrfError || err instanceof FetchError ? err : new FetchError('Could not resolve host')))
  }
}

// --------------------------------------------------------------------------- one HTTP exchange
function request(parsed, literal, { lookup, signal }) {
  return new Promise((resolve, reject) => {
    const getter = parsed.protocol === 'https:' ? httpsGet : httpGet
    const req = getter(
      {
        hostname: literal ?? parsed.hostname, // IPv6 literals without brackets
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': 'ReturnFlow-ImageFetcher/1.0', Accept: 'image/jpeg,image/png,image/webp', 'Accept-Encoding': 'identity' },
        agent: false, // no pooled sockets: each hop dials the address validated for it
        lookup,
        timeout: IDLE_TIMEOUT_MS,
        signal,
      },
      resolve,
    )
    req.on('timeout', () => req.destroy(new FetchError('Request timed out')))
    req.on('error', (err) => {
      if (err instanceof SsrfError || err instanceof FetchError) return reject(err)
      if (signal?.aborted) return reject(new FetchError('Request timed out'))
      reject(new FetchError(`Network error: ${err.code ?? 'unknown'}`))
    })
  })
}

function readBodyCapped(res, maxBytes, signal) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    let settled = false
    const finish = (fn, value) => { if (!settled) { settled = true; fn(value) } }
    // reject FIRST, then destroy: destroying emits 'aborted'/'close', which must not win the race with the real reason
    const fail = (err) => { finish(reject, err); res.destroy() }
    signal?.addEventListener('abort', () => fail(new FetchError('Request timed out')), { once: true })
    res.on('data', (chunk) => {
      total += chunk.length
      if (total > maxBytes) return fail(new FetchError('Response too large'))
      chunks.push(chunk)
    })
    res.on('end', () => finish(resolve, Buffer.concat(chunks)))
    res.on('error', () => fail(new FetchError(signal?.aborted ? 'Request timed out' : 'Read error')))
    res.on('aborted', () => fail(new FetchError(signal?.aborted ? 'Request timed out' : 'Read error')))
    res.on('close', () => { if (!res.complete) fail(new FetchError(signal?.aborted ? 'Request timed out' : 'Read error')) })
  })
}

// --------------------------------------------------------------------------- main export
/**
 * @param {string} urlString
 * @param {object} [deps] test seams; production code passes nothing
 * @param {Function} [deps.resolver]  async (hostname, {all, verbatim}) => [{address, family}]
 * @param {Function} [deps.isBlocked] address policy (tests relax it only to reach a local test server)
 * @param {number}   [deps.totalTimeoutMs]
 * @param {boolean}  [deps.allowHttp]  tests only: lets the local plain-http test servers be reached. Never set in production code.
 */
export async function safeFetchImage(urlString, { resolver = dnsLookup, isBlocked = isBlockedAddress, totalTimeoutMs = TOTAL_TIMEOUT_MS, maxBytes = MAX_FETCH_BYTES, allowHttp = false } = {}) {
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), totalTimeoutMs)
  const lookup = makeLookup(resolver, isBlocked)
  const seen = new Set()
  try {
    let current = urlString
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const { parsed, literal } = parseAndCheckUrl(current, isBlocked, allowHttp)
      if (seen.has(parsed.href)) throw new FetchError('Redirect loop')
      seen.add(parsed.href)

      const res = await request(parsed, literal, { lookup, signal: controller.signal })

      if (REDIRECT_STATUSES.has(res.statusCode) && res.headers.location) {
        res.destroy()
        if (hop === MAX_REDIRECTS) throw new FetchError('Too many redirects')
        try { current = new URL(res.headers.location, parsed).toString() } catch { throw new SsrfError('Invalid redirect URL') }
        continue // the next loop turn validates the target exactly like the first URL
      }
      if (res.statusCode !== 200) { res.destroy(); throw new FetchError(`Unexpected HTTP status: ${res.statusCode}`) }

      const contentType = (res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) { res.destroy(); throw new FetchError('Unsupported content type') }
      const declared = Number(res.headers['content-length'])
      if (Number.isFinite(declared) && declared > maxBytes) { res.destroy(); throw new FetchError('Response too large') }

      const body = await readBodyCapped(res, maxBytes, controller.signal)
      const real = SIGNATURES.find((s) => s.test(body)) // the bytes decide, not the header
      if (!real) throw new FetchError('Response body is not a recognised image format')
      return { body, contentType: real.type }
    }
    throw new FetchError('Too many redirects')
  } finally {
    clearTimeout(deadline)
  }
}
