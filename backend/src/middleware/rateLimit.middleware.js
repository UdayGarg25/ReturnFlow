import crypto from 'node:crypto';
import { getRedisClient } from '../config/redis.js';

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

const CHECK_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local pttl = redis.call('PTTL', KEYS[1])
return { current, pttl }
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

async function executeCheck(client, key, windowMs) {
  if (typeof client.eval === 'function') {
    const raw = await client.eval(CHECK_LUA, {
      keys: [key],
      arguments: [],
    });
    return [Number(raw[0]), Number(raw[1])];
  }
  const raw = await client.get(key);
  const current = raw ? Number(raw) : 0;
  const pttl = await client.pTTL(key);
  return [current, pttl > 0 ? pttl : windowMs];
}

const sanitizeLimiterError = (error) => {
  if (typeof error?.code === 'string' && error.code.trim()) return error.code.trim().toUpperCase();
  if (typeof error?.name === 'string' && error.name.trim()) return error.name.trim().toUpperCase();
  return 'RATELIMIT_ERROR';
};

export function createRateLimiter({
  name = 'default',
  windowMs,
  max,
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

  const applyLocalFallback = (req, res, next, k) => {
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

    if (!countIf) {
      addLocalHit(k, now);
      const updated = getLocalEntry(k, now);
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - (updated?.count || 1))));
    } else {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) localHits.delete(k);
        else if (countIf(res.statusCode)) addLocalHit(k, Date.now());
      });
    }

    return next();
  };

  const handleFallback = (req, res, next, k, reason = 'unavailable') => {
    logger.warn?.(`Redis rate limiting unavailable (${name}: ${reason}). Policy: ${fallbackPolicy}`);

    if (fallbackPolicy === 'fail_closed') {
      res.set('Retry-After', '30');
      return res.status(503).json({ message: 'Rate limiting service temporarily unavailable.' });
    }

    if (fallbackPolicy === 'fail_open') {
      return next();
    }

    return applyLocalFallback(req, res, next, k);
  };

  return async function rateLimit(req, res, next) {
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
      return handleFallback(req, res, next, k, 'disconnected');
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

      // countIf limiter (e.g. login failures): check count first without incrementing
      const [currentFailures, pttl] = await executeCheck(client, redisKey, windowMs);
      if (currentFailures >= max) {
        const retryAfterSec = Math.max(1, Math.ceil(pttl / 1000));
        res.set('Retry-After', String(retryAfterSec));
        res.set('X-RateLimit-Limit', String(max));
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + Math.max(0, pttl)) / 1000)));
        return res.status(429).json({ message: 'Too many attempts. Please wait a while and try again.' });
      }

      res.on('finish', async () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            await client.del(redisKey);
          } else if (countIf(res.statusCode)) {
            await executeIncrement(client, redisKey, windowMs, max);
          }
        } catch (error) {
          logger.error?.(`Redis error updating rate limit counter (${name}: ${sanitizeLimiterError(error)})`);
        }
      });

      return next();
    } catch (error) {
      const errCode = sanitizeLimiterError(error);
      return handleFallback(req, res, next, k, errCode);
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

export const apiLimiter = createRateLimiter({
  name: 'api_general',
  windowMs: FIFTEEN_MINUTES,
  max: number('RATE_LIMIT_API_PER_IP', 300),
  key: getClientIp,
});
