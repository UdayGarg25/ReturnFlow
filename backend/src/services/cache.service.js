import { getRedisClient } from '../config/redis.js';

const sanitizeCacheError = (error) => {
  if (typeof error?.code === 'string' && error.code.trim()) return error.code.trim().toUpperCase();
  if (typeof error?.name === 'string' && error.name.trim()) return error.name.trim().toUpperCase();
  return 'CACHE_ERROR';
};

export function createCacheService({
  getClient = getRedisClient,
  logger = console,
  defaultTtlSeconds = 300,
} = {}) {
  const isAvailable = () => {
    const client = getClient();
    return Boolean(client && client.isOpen && client.isReady);
  };

  const get = async (key) => {
    try {
      if (!isAvailable()) return null;
      const client = getClient();
      const raw = await client.get(key);
      if (raw === null || raw === undefined) return null;
      return JSON.parse(raw);
    } catch (error) {
      logger.error(`Redis cache get failed for key "${key}" (${sanitizeCacheError(error)})`);
      return null;
    }
  };

  const set = async (key, value, ttlSeconds = defaultTtlSeconds) => {
    try {
      if (!isAvailable()) return false;
      const client = getClient();
      const payload = JSON.stringify(value);
      const effectiveTtl = Number.isInteger(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : defaultTtlSeconds;
      await client.set(key, payload, { EX: effectiveTtl });
      return true;
    } catch (error) {
      logger.error(`Redis cache set failed for key "${key}" (${sanitizeCacheError(error)})`);
      return false;
    }
  };

  const del = async (keyOrKeys) => {
    try {
      if (!isAvailable()) return 0;
      const client = getClient();
      const keys = Array.isArray(keyOrKeys) ? keyOrKeys.filter(Boolean) : [keyOrKeys].filter(Boolean);
      if (keys.length === 0) return 0;
      return await client.del(keys);
    } catch (error) {
      logger.error(`Redis cache del failed (${sanitizeCacheError(error)})`);
      return 0;
    }
  };

  /**
   * Cache-Aside helper:
   * 1. Check Redis cache.
   * 2. On miss, invoke fetcherFn().
   * 3. Cache the result in Redis with TTL.
   * 4. If Redis fails at any point, transparently returns data from fetcherFn().
   */
  const remember = async (key, ttlOrFetcher, maybeFetcher) => {
    const ttlSeconds = typeof ttlOrFetcher === 'number' ? ttlOrFetcher : defaultTtlSeconds;
    const fetcher = typeof ttlOrFetcher === 'function' ? ttlOrFetcher : maybeFetcher;

    if (typeof fetcher !== 'function') {
      throw new TypeError('remember requires a fetcher function');
    }

    const cached = await get(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const freshData = await fetcher();
    if (freshData !== null && freshData !== undefined) {
      await set(key, freshData, ttlSeconds);
    }

    return freshData;
  };

  return {
    isAvailable,
    get,
    set,
    del,
    remember,
  };
}

export const cacheService = createCacheService();

