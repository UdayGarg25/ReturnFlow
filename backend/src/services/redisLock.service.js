import crypto from 'node:crypto';
import { getRedisClient } from '../config/redis.js';

export const DEFAULT_LOCK_TTL_MS = Number(process.env.REDIS_LOCK_DEFAULT_TTL_MS) || 10_000;
export const DEFAULT_ACQUIRE_TIMEOUT_MS = Number(process.env.REDIS_LOCK_ACQUIRE_TIMEOUT_MS) || 0;
export const DEFAULT_RETRY_DELAY_MS = 50;

export class LockContentionError extends Error {
  constructor(message = 'Resource is currently locked by another operation.') {
    super(message);
    this.name = 'LockContentionError';
    this.code = 'LOCK_CONTENTION';
  }
}

export class LockTimeoutError extends Error {
  constructor(message = 'Timed out waiting to acquire lock.') {
    super(message);
    this.name = 'LockTimeoutError';
    this.code = 'LOCK_TIMEOUT';
  }
}

export class RedisUnavailableError extends Error {
  constructor(message = 'Redis is unavailable for distributed locking.') {
    super(message);
    this.name = 'RedisUnavailableError';
    this.code = 'REDIS_UNAVAILABLE';
  }
}

const RELEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

const sanitizeLockError = (error) => {
  if (typeof error?.code === 'string' && error.code.trim()) return error.code.trim().toUpperCase();
  if (typeof error?.name === 'string' && error.name.trim()) return error.name.trim().toUpperCase();
  return 'LOCK_ERROR';
};

/**
 * Acquires a distributed lock in Redis.
 * Uses atomic SET with NX and PX (finite lease).
 */
export async function acquireLock(
  resourceKey,
  {
    ttlMs = DEFAULT_LOCK_TTL_MS,
    timeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    getClient = getRedisClient,
    logger = console,
  } = {},
) {
  if (typeof resourceKey !== 'string' || !resourceKey.trim()) {
    throw new TypeError('resourceKey must be a non-empty string');
  }

  const cleanKey = resourceKey.trim();
  const lockKey = `rf:lock:${cleanKey}`;
  const token = crypto.randomUUID();
  const leaseMs = Number.isInteger(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_LOCK_TTL_MS;
  const maxWaitMs = Number.isInteger(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 0;
  const backoffMs = Number.isInteger(retryDelayMs) && retryDelayMs > 0 ? retryDelayMs : DEFAULT_RETRY_DELAY_MS;

  const startTime = Date.now();

  while (true) {
    let client = null;
    try {
      client = typeof getClient === 'function' ? getClient() : null;
    } catch {
      client = null;
    }

    const isAvailable = Boolean(client && client.isOpen && client.isReady);
    if (!isAvailable) {
      throw new RedisUnavailableError(`Redis unavailable when acquiring lock for "${cleanKey}"`);
    }

    let result;
    try {
      result = await client.set(lockKey, token, {
        NX: true,
        PX: leaseMs,
      });
    } catch (error) {
      logger.error?.(`Redis error during lock acquisition for "${cleanKey}" (${sanitizeLockError(error)})`);
      throw new RedisUnavailableError(`Redis command failed during lock acquisition for "${cleanKey}"`);
    }

    if (result === 'OK') {
      return {
        resourceKey: cleanKey,
        lockKey,
        token,
        ttlMs: leaseMs,
        acquiredAt: Date.now(),
      };
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= maxWaitMs) {
      if (maxWaitMs === 0) {
        throw new LockContentionError(`Resource "${cleanKey}" is already locked.`);
      }
      throw new LockTimeoutError(`Timed out after ${maxWaitMs}ms acquiring lock for "${cleanKey}".`);
    }

    const remainingWait = maxWaitMs - elapsed;
    const sleepDuration = Math.min(backoffMs, remainingWait);
    await new Promise((resolve) => setTimeout(resolve, sleepDuration));
  }
}

/**
 * Releases a distributed lock in Redis.
 * Releases ONLY if the token matches the owner's token (atomic Lua compare-and-delete).
 */
export async function releaseLock(lock, { getClient = getRedisClient, logger = console } = {}) {
  if (!lock || typeof lock.lockKey !== 'string' || typeof lock.token !== 'string') {
    return false;
  }

  let client = null;
  try {
    client = typeof getClient === 'function' ? getClient() : null;
  } catch {
    client = null;
  }

  const isAvailable = Boolean(client && client.isOpen && client.isReady);
  if (!isAvailable) {
    logger.error?.(`Redis unavailable when releasing lock "${lock.lockKey}"`);
    throw new RedisUnavailableError(`Redis unavailable when releasing lock "${lock.lockKey}"`);
  }

  try {
    let released = 0;
    if (typeof client.eval === 'function') {
      const res = await client.eval(RELEASE_LUA, {
        keys: [lock.lockKey],
        arguments: [lock.token],
      });
      released = Number(res) === 1 ? 1 : 0;
    } else {
      // Fallback for minimal mocks without eval
      const currentToken = await client.get?.(lock.lockKey);
      if (currentToken === lock.token) {
        await client.del?.(lock.lockKey);
        released = 1;
      }
    }
    return released === 1;
  } catch (error) {
    logger.error?.(`Redis error releasing lock "${lock.lockKey}" (${sanitizeLockError(error)})`);
    throw error;
  }
}

/**
 * Executes an async callback within the context of a distributed lock.
 * Guarantees that release is attempted in a finally block and original callback errors are preserved.
 */
export async function withLock(
  resourceKey,
  callback,
  {
    ttlMs = DEFAULT_LOCK_TTL_MS,
    timeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    bypassIfDbGuarded = false,
    getClient = getRedisClient,
    logger = console,
  } = {},
) {
  if (typeof callback !== 'function') {
    throw new TypeError('withLock requires a callback function');
  }

  let lock = null;
  try {
    lock = await acquireLock(resourceKey, { ttlMs, timeoutMs, retryDelayMs, getClient, logger });
  } catch (err) {
    if (err instanceof RedisUnavailableError && bypassIfDbGuarded) {
      logger.warn?.(`Redis lock unavailable for "${resourceKey}". Proceeding with database-level protection only.`);
      return callback(null);
    }
    throw err;
  }

  let callbackError = null;
  let result;

  try {
    result = await callback(lock);
  } catch (err) {
    callbackError = err;
    throw err;
  } finally {
    if (lock) {
      try {
        await releaseLock(lock, { getClient, logger });
      } catch (releaseErr) {
        logger.error?.(`Failed to release lock "${lock.lockKey}":`, releaseErr.message);
        if (!callbackError) {
          throw releaseErr;
        }
      }
    }
  }

  return result;
}

