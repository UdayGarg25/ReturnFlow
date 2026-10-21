import { createClient } from 'redis';

const MAX_RECONNECT_ATTEMPTS = 3;
const SOCKET_CONNECT_TIMEOUT_MS = 5000;

const normalizeRedisUrl = (value) => (typeof value === 'string' ? value.trim() : '');
const sanitizeRedisError = (error) => {
  if (typeof error?.code === 'string' && error.code.trim()) return error.code.trim().toUpperCase();
  if (typeof error?.name === 'string' && error.name.trim()) return error.name.trim().toUpperCase();
  return 'UNKNOWN_ERROR';
};

export function createRedisManager({ env = process.env, logger = console, createClientFn = createClient } = {}) {
  const redisUrl = normalizeRedisUrl(env.REDIS_URL);
  const configured = redisUrl.length > 0;

  let client = null;
  let initPromise = null;
  let closePromise = null;
  let state = configured ? 'disconnected' : 'not_configured';
  let lastErrorCode = null;

  const isConnected = () => Boolean(client?.isOpen && client?.isReady);

  const getHealth = () => ({
    configured,
    optional: true,
    connected: isConnected(),
    status: configured ? (isConnected() ? 'up' : 'down') : 'not_configured',
    state,
    lastErrorCode,
  });

  const ensureClient = () => {
    if (client || !configured) return client;

    client = createClientFn({
      url: redisUrl,
      socket: {
        connectTimeout: SOCKET_CONNECT_TIMEOUT_MS,
        reconnectStrategy: (retries) => (retries >= MAX_RECONNECT_ATTEMPTS ? false : Math.min((retries + 1) * 250, 1000)),
      },
    });

    client.on('ready', () => {
      state = 'ready';
      lastErrorCode = null;
      logger.log('Redis connected');
    });

    client.on('reconnecting', () => {
      state = 'reconnecting';
    });

    client.on('end', () => {
      if (state !== 'closing' && state !== 'closed') state = 'disconnected';
    });

    client.on('error', (error) => {
      lastErrorCode = sanitizeRedisError(error);
      if (state !== 'closing' && state !== 'closed') state = 'error';
      logger.error(`Redis connection error (${lastErrorCode})`);
    });

    return client;
  };

  const initialize = async () => {
    if (!configured) {
      state = 'not_configured';
      return getHealth();
    }
    if (isConnected()) return getHealth();
    if (initPromise) return initPromise;

    let redisClient;
    try {
      redisClient = ensureClient();
    } catch (error) {
      lastErrorCode = sanitizeRedisError(error);
      state = 'unavailable';
      logger.error(`Redis unavailable (${lastErrorCode}). Continuing without Redis.`);
      return getHealth();
    }

    initPromise = (async () => {
      state = 'connecting';
      try {
        await redisClient.connect();
        if (!isConnected()) state = 'disconnected';
      } catch (error) {
        lastErrorCode = sanitizeRedisError(error);
        state = 'unavailable';
        logger.error(`Redis unavailable (${lastErrorCode}). Continuing without Redis.`);
      }
      return getHealth();
    })().finally(() => {
      initPromise = null;
    });

    return initPromise;
  };

  const close = async () => {
    if (!client) {
      state = configured ? 'closed' : 'not_configured';
      return;
    }
    if (closePromise) return closePromise;

    closePromise = (async () => {
      state = 'closing';
      try {
        if (client.isOpen) {
          await client.quit();
        }
      } catch (error) {
        lastErrorCode = sanitizeRedisError(error);
        logger.error(`Redis shutdown error (${lastErrorCode})`);
        try {
          client.disconnect();
        } catch {
          // no-op
        }
      } finally {
        state = 'closed';
      }
    })().finally(() => {
      closePromise = null;
    });

    return closePromise;
  };

  return {
    initialize,
    close,
    getHealth,
  };
}

const redisManager = createRedisManager();

export const initializeRedis = () => redisManager.initialize();
export const closeRedis = () => redisManager.close();
export const getRedisHealth = () => redisManager.getHealth();
