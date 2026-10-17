// A small in-memory rate limiter (no dependency). Good enough for ONE server process:
// counters live in memory, so they reset on restart and are not shared between
// several instances. For a multi-instance deployment move the counters to Redis.
// Behind a reverse proxy, set Express' "trust proxy" so req.ip is the real client.
//
// options:
//   windowMs  length of the window
//   max       requests (or failures) allowed per key per window
//   key       (req) => string identifying who is being limited (default: client IP)
//   countIf   (statusCode) => boolean. Omitted: every request counts. Given: only
//             responses it accepts count (e.g. failed logins), and any 2xx clears the key.
export function createRateLimiter({ windowMs, max, key = (req) => req.ip, countIf }) {
  const hits = new Map() // key -> { count, resetAt }

  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
  }, Math.min(windowMs, 60_000)).unref()

  const current = (k, now) => {
    const entry = hits.get(k)
    return entry && entry.resetAt > now ? entry : undefined
  }
  const add = (k, now) => {
    const entry = current(k, now)
    if (entry) entry.count++
    else hits.set(k, { count: 1, resetAt: now + windowMs })
  }

  return function rateLimit(req, res, next) {
    const k = key(req)
    const now = Date.now()
    const entry = current(k, now)

    if (entry && entry.count >= max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      // Same wording whatever the account: it must not reveal whether an email exists.
      return res.status(429).json({ message: 'Too many attempts. Please wait a while and try again.' })
    }

    if (!countIf) add(k, now)
    else {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) hits.delete(k)
        else if (countIf(res.statusCode)) add(k, Date.now())
      })
    }
    return next()
  }
}

const number = (name, fallback) => {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

const FIFTEEN_MINUTES = 15 * 60 * 1000

// Login: a generous cap per IP, plus a strict cap on FAILED attempts per IP + email so one
// account cannot be guessed at. Unknown emails are counted the same way as real ones.
export const loginIpLimiter = createRateLimiter({ windowMs: FIFTEEN_MINUTES, max: number('RATE_LIMIT_LOGIN_PER_IP', 50) })
export const loginFailureLimiter = createRateLimiter({
  windowMs: FIFTEEN_MINUTES,
  max: number('RATE_LIMIT_LOGIN_FAILURES', 5),
  key: (req) => `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254)}`,
  countIf: (status) => status === 401,
})
// Register: cap sign-ups per IP per hour.
export const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: number('RATE_LIMIT_REGISTER_PER_IP', 20) })
// AI assessments call a rate-limited external model: cap how often one staff member can start them.
export const aiAssessmentLimiter = createRateLimiter({ windowMs: FIFTEEN_MINUTES, max: number('RATE_LIMIT_AI_PER_USER', 20), key: (req) => `ai:${req.user?.id ?? req.ip}` })

// Public invitation links: slow down token guessing and password-setting attempts per IP.
export const invitationLimiter = createRateLimiter({ windowMs: FIFTEEN_MINUTES, max: number('RATE_LIMIT_INVITATION_PER_IP', 60) })
// Public demo helpers: a full guided run is about a dozen calls.
export const demoLimiter = createRateLimiter({ windowMs: FIFTEEN_MINUTES, max: number('RATE_LIMIT_DEMO_PER_IP', 200) })
