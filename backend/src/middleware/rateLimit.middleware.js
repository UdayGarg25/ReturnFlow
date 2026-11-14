import crypto from 'node:crypto';
import { authConfig } from '../config/auth.js';
import { getRedisClient, getRedisHealth } from '../config/redis.js';
import { verifyToken } from '../utils/jwt.js';

export function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

export function hashIdentifier(value) {
  const clean = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return crypto.createHash('sha256').update(clean).digest('hex').slice(0, 16);
}

const INCREMENT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local pttl = redis.call('PTTL', KEYS[1])
if pttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  pttl = tonumber(ARGV[1])
end
return { current, pttl }
`;

// Gives back one reservation made by INCREMENT_LUA (never below zero; an emptied counter is removed).
const REFUND_LUA = `
local v = redis.call('DECR', KEYS[1])
if v <= 0 then redis.call('DEL', KEYS[1]) end
return v
`;

async function executeIncrement(client, key, windowMs, max) {
  if (typeof client.eval === 'function') {
    const raw = await client.eval(INCREMENT_LUA, {
      keys: [key],
      arguments: [String(windowMs), String(max)],
    });
    return [Number(raw[0]), Number(raw[1])];
  }
  const current = await client.incr(key);
  if (current === 1) {
    await client.pExpire(key, windowMs);
  }
  const pttl = await client.pTTL(key);
  return [current, pttl > 0 ? pttl : windowMs];
}

async function executeRefund(client, key) {
  if (typeof client.eval === 'function') {
    await client.eval(REFUND_LUA, { keys: [key], arguments: [] });
    return;
  }
  const v = await client.decr(key);
  if (v <= 0) await client.del(key);
}

const getHealthSafe = () => {
  try { return getRedisHealth(); } catch { return null; }
};

const sanitizeLimiterError = (error) => {
  if (typeof error?.code === 'string' && error.code.trim()) return error.code.trim().toUpperCase();
  if (typeof error?.name === 'string' && error.name.trim()) return error.name.trim().toUpperCase();
  return 'RATELIMIT_ERROR';
};

export function createRateLimiter({
  name = 'default',
  windowMs,
  max: maxOrFn,
  key = getClientIp,
  countIf,
  fallbackPolicy = 'local_memory',
  getClient = getRedisClient,
  logger = console,
}) {
  const localHits = new Map(); // fallback memory store

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of localHits) {
      if (v.resetAt <= now) localHits.delete(k);
    }
  }, Math.min(windowMs, 60_000));
  cleanupTimer.unref?.();

  const getLocalEntry = (k, now) => {
    const entry = localHits.get(k);
    return entry && entry.resetAt > now ? entry : undefined;
  };

  const addLocalHit = (k, now) => {
    const entry = getLocalEntry(k, now);
    if (entry) entry.count++;
    else localHits.set(k, { count: 1, resetAt: now + windowMs });
  };

  const applyLocalFallback = (req, res, next, k, max) => {
    res.set('X-RateLimit-Fallback', 'local-memory');
    const now = Date.now();
    const entry = getLocalEntry(k, now);

    if (entry && entry.count >= max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
      return res.status(429).json({ message: 'Too many attempts. Please wait a while and try again.' });
    }

    // Reserve the attempt NOW (also for countIf limiters), then settle when the response is known.
    addLocalHit(k, now);
    const updated = getLocalEntry(k, now);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - (updated?.count || 1))));
    if (countIf) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) localHits.delete(k);
        else if (!countIf(res.statusCode)) {
          const e = getLocalEntry(k, Date.now());
          if (e && --e.count <= 0) localHits.delete(k);
        }
      });
    }

    return next();
  };

  // Said once per minute per limiter (and again when the reason changes), not on every request. The reason names the real
  // state: "REDIS_URL is not set" is a configuration choice, not an outage.
  let lastWarn = { reason: null, at: 0 };
  const handleFallback = (req, res, next, k, max, reason = 'unavailable') => {
    const health = getHealthSafe();
    const why = health && !health.configured ? 'Redis not configured (REDIS_URL is not set)' : health ? `${reason}; Redis ${health.state}` : reason;
    const now = Date.now();
    if (lastWarn.reason !== why || now - lastWarn.at > 60_000) {
      lastWarn = { reason: why, at: now };
      logger.warn?.(`Redis rate limiting unavailable (${name}: ${why}). Policy: ${fallbackPolicy}`);
    }

    if (fallbackPolicy === 'fail_closed') {
      res.set('Retry-After', '30');
      return res.status(503).json({ message: 'Rate limiting service temporarily unavailable.' });
    }

    if (fallbackPolicy === 'fail_open') {
      return next();
    }

    return applyLocalFallback(req, res, next, k, max);
  };

  return async function rateLimit(req, res, next) {
    const max = typeof maxOrFn === 'function' ? maxOrFn(req) : maxOrFn; // the limit may depend on who is calling
    const rawKey = key(req);
    const k = String(rawKey ?? getClientIp(req)).trim();
    const redisKey = `rf:rl:${name}:${k}`;

    let client = null;
    try {
      client = typeof getClient === 'function' ? getClient() : null;
    } catch {
      client = null;
    }

    const redisActive = Boolean(client && client.isOpen && client.isReady);
    if (!redisActive) {
      return handleFallback(req, res, next, k, max, 'disconnected');
    }

    try {
      if (!countIf) {
        // Standard limiter: increment immediately
        const [count, pttl] = await executeIncrement(client, redisKey, windowMs, max);
        const resetTimeSec = Math.ceil((Date.now() + Math.max(0, pttl)) / 1000);
        res.set('X-RateLimit-Limit', String(max));
        res.set('X-RateLimit-Remaining', String(Math.max(0, max - count)));
        res.set('X-RateLimit-Reset', String(resetTimeSec));

        if (count > max) {
          const retryAfterSec = Math.max(1, Math.ceil(pttl / 1000));
          res.set('Retry-After', String(retryAfterSec));
          return res.status(429).json({ message: 'Too many attempts. Please wait a while and try again.' });
        }

        return next();
      }

      // countIf limiter (e.g. failed logins). The old "read the count, run the handler, add 1 afterwards" let a burst of
      // concurrent attempts all pass the check before any failure was recorded. Now every attempt RESERVES a slot
      // atomically before it runs (one Lua INCR), so at most `max` attempts per window can ever be in progress or
      // failed, however they interleave across requests and instances. When the response is known the slot is settled:
      //   2xx                  -> the counter is cleared (a correct password resets it)
      //   not a counted status -> the slot is refunded (a 400 for a malformed body is not a failed guess)
      //   counted status (401) -> the slot stays used
      //   no response at all   -> the slot stays used (aborting a request must not dodge the limit)
      const [reserved, pttl] = await executeIncrement(client, redisKey, windowMs, max);
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + Math.max(0, pttl)) / 1000)));
      if (reserved > max) {
        res.set('Retry-After', String(Math.max(1, Math.ceil(pttl / 1000))));
        res.set('X-RateLimit-Remaining', '0');
        return res.status(429).json({ message: 'Too many attempts. Please wait a while and try again.' });
      }
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - reserved)));

      res.on('finish', async () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) await client.del(redisKey);
          else if (!countIf(res.statusCode)) await executeRefund(client, redisKey);
        } catch (error) {
          logger.error?.(`Redis error settling rate limit counter (${name}: ${sanitizeLimiterError(error)})`);
        }
      });

      return next();
    } catch (error) {
      const errCode = sanitizeLimiterError(error);
      return handleFallback(req, res, next, k, max, errCode);
    }
  };
}

const number = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const loginIpLimiter = createRateLimiter({
  name: 'login_ip',
  windowMs: FIFTEEN_MINUTES,
  max: number('RATE_LIMIT_LOGIN_PER_IP', 50),
  key: getClientIp,
});

export const loginFailureLimiter = createRateLimiter({
  name: 'login_failures',
  windowMs: FIFTEEN_MINUTES,
  max: number('RATE_LIMIT_LOGIN_FAILURES', 5),
  key: (req) => {
    const ip = getClientIp(req);
    const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254);
    const hashed = hashIdentifier(email);
    return `${ip}|${hashed}`;
  },
  countIf: (status) => status === 401,
});

export const registerLimiter = createRateLimiter({
  name: 'register_ip',
  windowMs: 60 * 60 * 1000,
  max: number('RATE_LIMIT_REGISTER_PER_IP', 20),
  key: getClientIp,
});

export const aiAssessmentLimiter = createRateLimiter({
  name: 'ai_assessment',
  windowMs: FIFTEEN_MINUTES,
  max: number('RATE_LIMIT_AI_PER_USER', 20),
  key: (req) => `ai:${req.user?.id ?? getClientIp(req)}`,
});

export const invitationLimiter = createRateLimiter({
  name: 'invitation_ip',
  windowMs: FIFTEEN_MINUTES,
  max: number('RATE_LIMIT_INVITATION_PER_IP', 60),
  key: getClientIp,
});

export const demoLimiter = createRateLimiter({
  name: 'demo_ip',
  windowMs: FIFTEEN_MINUTES,
  max: number('RATE_LIMIT_DEMO_PER_IP', 200),
  key: getClientIp,
});

// General API limit. Keyed by the VERIFIED user when the request carries a valid session cookie, otherwise by IP, so a
// whole office behind one NAT does not share a single budget, and an unauthenticated flood is still counted per IP.
// Budget: a warehouse screen polls an AI assessment every 2.5 s while it runs (~24 requests/min), a dashboard load is
// about 8 requests and each private image is one more (browser-cached for 5 min), so 60/min per user leaves headroom
// without allowing scripted scraping. Anonymous callers only reach public endpoints, which have their own limiters.
const apiCallerId = (req) => {
  const token = req.cookies?.[authConfig.cookieName];
  if (typeof token !== 'string' || token === '') return null;
  try {
    const { userId } = verifyToken(token);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
  } catch {
    return null; // forged or expired: treated like an anonymous caller (counted per IP)
  }
};
export const apiLimiter = createRateLimiter({
  name: 'api_general',
  windowMs: FIFTEEN_MINUTES,
  max: (req) => (apiCallerId(req) ? number('RATE_LIMIT_API_PER_USER', 900) : number('RATE_LIMIT_API_PER_IP', 300)),
  key: (req) => {
    const userId = apiCallerId(req);
    return userId ? `user:${userId}` : `ip:${getClientIp(req)}`;
  },
});

// Password changes: per signed-in user, so a stolen session cannot be used to guess the current password quickly.
export const changePasswordLimiter = createRateLimiter({
  name: 'change_password',
  windowMs: FIFTEEN_MINUTES,
  max: number('RATE_LIMIT_CHANGE_PASSWORD_PER_USER', 10),
  key: (req) => `user:${req.user?.id ?? getClientIp(req)}`,
});
