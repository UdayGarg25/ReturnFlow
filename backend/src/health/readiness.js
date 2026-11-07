import crypto from 'node:crypto';
import pool from '../config/db.js';
import { authConfig } from '../config/auth.js';
import { getCurrentUser } from '../services/auth.service.js';
import { verifyToken } from '../utils/jwt.js';
import { getRedisHealth } from '../config/redis.js';

export async function getReadinessStatus({ dbPool = pool, redisHealthProvider = getRedisHealth } = {}) {
  let postgresUp = false;

  try {
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('PostgreSQL readiness timed out')), 3000);
      timer.unref?.();
    });
    await Promise.race([dbPool.query('SELECT 1'), timeoutPromise]);
    postgresUp = true;
  } catch {
    postgresUp = false;
  }

  const redisHealth = redisHealthProvider();
  const redisStatus = redisHealth.configured ? (redisHealth.connected ? 'up' : 'down') : 'not_configured';

  const dependencies = {
    postgresql: {
      status: postgresUp ? 'up' : 'down',
    },
    redis: {
      optional: true,
      configured: redisHealth.configured,
      status: redisStatus,
      connected: redisHealth.connected,
      state: redisHealth.state,
    },
  };

  if (redisHealth.lastErrorCode) {
    dependencies.redis.errorCode = redisHealth.lastErrorCode;
  }

  const status = !postgresUp ? 'error' : redisStatus === 'up' ? 'ok' : 'degraded';
  const httpStatus = postgresUp ? 200 : 503;

  return {
    httpStatus,
    body: {
      status,
      dependencies,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Who may see WHICH dependencies are up, and Redis' last error code? That is operational detail an attacker can use
// (it tells them what is degraded and when). The public answer is only the overall status, which a load balancer needs
// (and which the HTTP status code already carries). Details are for:
//   - an ADMIN with a valid session, or
//   - a monitoring system that sends the header  X-Health-Token: <HEALTH_CHECK_TOKEN>  (min. 16 characters; if the
//     variable is unset or shorter, token access is simply off).
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest();

export async function canSeeReadinessDetail(req, { env = process.env, verify = verifyToken, findUser = getCurrentUser, cookieName = authConfig.cookieName } = {}) {
  const expected = env.HEALTH_CHECK_TOKEN;
  const supplied = req.headers?.['x-health-token'];
  if (typeof expected === 'string' && expected.length >= 16 && typeof supplied === 'string' && crypto.timingSafeEqual(sha256(supplied), sha256(expected))) return true;

  const cookie = req.cookies?.[cookieName];
  if (typeof cookie !== 'string' || cookie === '') return false;
  try {
    const { userId } = verify(cookie);
    if (!Number.isSafeInteger(userId) || userId <= 0) return false;
    return (await findUser(userId))?.role === 'ADMIN';
  } catch {
    return false;
  }
}

export const publicReadinessBody = (body) => ({ status: body.status });
