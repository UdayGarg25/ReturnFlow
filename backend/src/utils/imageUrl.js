import { isIP } from 'node:net'

// Input check for an image URL a SELLER types in (products.image_url). It stops the obviously wrong values early with a
// clear message; it is NOT the SSRF defence. The real guard is safeFetchImage, which re-checks the scheme, resolves
// the name, validates every address and every redirect at fetch time (a hostname can change what it points to later).
// Returns an error message, or null when the URL is acceptable.
const INTERNAL_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.localdomain', '.home.arpa', '.corp', '.intranet']

export function sellerImageUrlProblem(value) {
  if (typeof value !== 'string' || value.length > 500) return 'Image URL must be a valid https address of at most 500 characters.'
  let url
  try { url = new URL(value) } catch { return 'Image URL must be a valid https address.' }
  if (url.protocol !== 'https:') return 'Image URL must start with https://.'
  if (url.username || url.password) return 'Image URL must not contain a user name or password.'
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (isIP(host.replace(/^\[|\]$/g, ''))) return 'Use a web address with a domain name, not an IP address.'
  if (!host.includes('.') || INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) return 'Image URL must point to a public website.'
  return null
}
