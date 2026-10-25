import pool from '../config/db.js';
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
