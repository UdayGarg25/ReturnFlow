// Turns the TRUST_PROXY env value into what Express' "trust proxy" setting needs.
// Why this matters: req.ip (used by every IP rate limit) comes from X-Forwarded-For ONLY if Express trusts the proxy
// that set it. Trusting too little makes every user share the proxy's IP; trusting everything lets a client forge the
// header and dodge the limits. The safe setting is the exact number of proxies in front of the app.
//   unset / "false"      -> false         (no proxy; req.ip is the TCP peer)  [default]
//   "1", "2", ...        -> that number   (trust exactly that many hops; Render / one Nginx / one load balancer = 1)
//   "loopback, 10.0.0.0/8" -> passed on   (trust only these proxy addresses)
//   "true"               -> true          (trust every hop: spoofable, so a warning is logged)
export function parseTrustProxy(value, { logger = console } = {}) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw === '' || raw.toLowerCase() === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw.toLowerCase() === 'true') {
    logger.warn?.('TRUST_PROXY=true trusts every X-Forwarded-For hop, so clients can forge their IP and evade IP rate limits. Prefer the number of proxies in front of the app (for example TRUST_PROXY=1).');
    return true;
  }
  return raw;
}
