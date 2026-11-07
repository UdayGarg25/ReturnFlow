import { createClient } from 'redis';

// Redis is OPTIONAL for ReturnFlow: PostgreSQL stays the source of truth, and every Redis consumer (cache, rate
// limiter, locks) has a defined behaviour when Redis is down. This module only owns the connection.
//
// Reliability model:
//  - The client reconnects FOREVER with bounded exponential backoff + jitter (max REDIS_MAX_BACKOFF_MS), so a short or
//    long outage heals by itself, without restarting the backend, and an unreachable Redis is never hammered.
//  - Startup never waits longer than REDIS_STARTUP_WAIT_MS for Redis; if it is not up yet the server starts anyway and
//    the client connects in the background ("Redis starts after the backend").
//  - Commands cannot block a request for long: the offline queue is disabled (a command while disconnected fails
//    immediately), every command made through a handed-out client is raced against REDIS_COMMAND_TIMEOUT_MS (an
//    AbortSignal would only cancel queued commands, not ones already sent to a frozen server), and a dead/hung socket is
//    detected (periodic PING + idle socketTimeout) and replaced.

const intFromEnv = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const SOCKET_CONNECT_TIMEOUT_MS = 5000;
const BASE_BACKOFF_MS = 200;

// Exponential backoff capped at maxMs, with "equal jitter" (half fixed, half random) so many instances do not retry in
// lockstep. retries counts from 0. `random` is injectable for tests.
export function computeBackoffMs(retries, { maxMs = 30_000, baseMs = BASE_BACKOFF_MS, random = Math.random } = {}) {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.min(Math.max(retries, 0), 20));
  return Math.floor(exp / 2 + random() * (exp / 2));
}

export class RedisCommandTimeoutError extends Error {
  constructor(ms) {
    super(`Redis command timed out after ${ms}ms`);
    this.name = 'RedisCommandTimeoutError';
    this.code = 'REDIS_COMMAND_TIMEOUT';
  }
}

// Wraps a client so every command that returns a promise rejects after `ms` instead of waiting for a frozen server.
// Everything else (isOpen, isReady, event methods, ...) passes straight through. The abandoned command is left to the
// client; it settles or is dropped when the socket is replaced.
export function withCommandTimeout(client, ms) {
  return new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      return (...args) => {
        const result = value.apply(target, args);
        if (!result || typeof result.then !== 'function') return result;
        result.then(undefined, () => {}); // a late failure of an abandoned command must not become an unhandled rejection
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new RedisCommandTimeoutError(ms)), ms);
          result.then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
          );
        });
      };
    },
  });
}

const normalizeRedisUrl = (value) => (typeof value === 'string' ? value.trim() : '');
const sanitizeRedisError = (error) => {
  if (typeof error?.code === 'string' && error.code.trim()) return error.code.trim().toUpperCase();
  if (typeof error?.name === 'string' && error.name.trim()) return error.name.trim().toUpperCase();
  return 'UNKNOWN_ERROR';
};

export function createRedisManager({ env = process.env, logger = console, createClientFn = createClient } = {}) {
  const redisUrl = normalizeRedisUrl(env.REDIS_URL);
  const configured = redisUrl.length > 0;

  const commandTimeoutMs = intFromEnv(env.REDIS_COMMAND_TIMEOUT_MS, 2000);
  // Idle socket timeout: the client PINGs at half this interval, so a healthy idle connection never trips it, but a
  // half-dead one (no answer) is destroyed and reconnected.
  const socketTimeoutMs = intFromEnv(env.REDIS_SOCKET_TIMEOUT_MS, 10_000);
  const maxBackoffMs = intFromEnv(env.REDIS_MAX_BACKOFF_MS, 30_000);
  const startupWaitMs = intFromEnv(env.REDIS_STARTUP_WAIT_MS, 3000);

  let client = null;
  let initPromise = null;
  let closePromise = null;
  let state = configured ? 'disconnected' : 'not_configured';
  let lastErrorCode = null;
  let lastLoggedError = { code: null, at: 0 };

  const isConnected = () => Boolean(client?.isOpen && client?.isReady);

  const getHealth = () => ({
    configured,
    optional: true,
    connected: isConnected(),
    status: configured ? (isConnected() ? 'up' : 'down') : 'not_configured',
    state,
    lastErrorCode,
  });

  // During an outage the client emits an error per attempt; log a given error code at most once per 30 s.
  const logErrorThrottled = (code) => {
    const now = Date.now();
    if (lastLoggedError.code === code && now - lastLoggedError.at < 30_000) return;
    lastLoggedError = { code, at: now };
    logger.error(`Redis connection error (${code})`);
  };

  const ensureClient = () => {
    if (client || !configured) return client;

    const created = createClientFn({
      url: redisUrl,
      disableOfflineQueue: true,
      pingInterval: Math.max(500, Math.floor(socketTimeoutMs / 2)),
      socket: {
        connectTimeout: SOCKET_CONNECT_TIMEOUT_MS,
        socketTimeout: socketTimeoutMs,
        // Never give up (returning false would leave a permanently dead client). Always back off, with a cap.
        reconnectStrategy: (retries) => computeBackoffMs(retries, { maxMs: maxBackoffMs }),
      },
    });
    client = created;

    created.on('ready', () => {
      if (client !== created) return;
      const recovered = lastErrorCode !== null;
      state = 'ready';
      lastErrorCode = null;
      lastLoggedError = { code: null, at: 0 };
      logger.log(recovered ? 'Redis reconnected' : 'Redis connected');
    });
    created.on('reconnecting', () => {
      if (client === created && state !== 'closing' && state !== 'closed') state = 'reconnecting';
    });
    created.on('end', () => {
      if (client === created && state !== 'closing' && state !== 'closed') state = 'disconnected';
    });
    created.on('error', (error) => {
      if (client !== created) return;
      lastErrorCode = sanitizeRedisError(error);
      if (state !== 'closing' && state !== 'closed' && state !== 'reconnecting') state = 'error';
      logErrorThrottled(lastErrorCode);
    });
    return created;
  };

  const initialize = async () => {
    if (!configured) {
      state = 'not_configured';
      return getHealth();
    }
    if (isConnected()) return getHealth();
    if (initPromise) return initPromise;

    initPromise = (async () => {
      let redisClient;
      try {
        redisClient = ensureClient();
      } catch (error) {
        lastErrorCode = sanitizeRedisError(error);
        state = 'unavailable';
        logger.error(`Redis unavailable (${lastErrorCode}). Continuing without Redis.`);
        return getHealth();
      }

      state = 'connecting';
      // connect() keeps retrying in the background (infinite strategy), so it can stay pending while Redis is down.
      // Startup waits for it only briefly; the server then starts and the client keeps trying.
      const connecting = redisClient.connect().then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error }),
      );
      const outcome = await Promise.race([
        connecting,
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ pending: true }), startupWaitMs);
          timer.unref?.();
        }),
      ]);

      if (outcome.pending) {
        if (!isConnected()) {
          state = 'reconnecting';
          logger.error(`Redis not reachable yet (${lastErrorCode ?? 'PENDING'}). Continuing without Redis; will keep retrying in the background.`);
        }
      } else if (!outcome.ok) {
        lastErrorCode = sanitizeRedisError(outcome.error);
        state = 'unavailable';
        client = null; // allow a later initialize() to build a fresh client
        logger.error(`Redis unavailable (${lastErrorCode}). Continuing without Redis.`);
      } else if (!isConnected()) {
        state = 'disconnected';
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
      const closing = client;
      try {
        if (closing.isOpen && closing.isReady) {
          // quit() waits for the reply; if Redis is hung, fall back to a hard disconnect after a short wait.
          let timer;
          try {
            await Promise.race([
              closing.quit(),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('quit timed out')), 2000); }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        } else if (closing.isOpen) {
          await closing.disconnect(); // still connecting or reconnecting: nothing to say goodbye to
        } else if (typeof closing.disconnect === 'function') {
          await closing.disconnect();
        }
      } catch (error) {
        lastErrorCode = sanitizeRedisError(error);
        logger.error(`Redis shutdown error (${lastErrorCode})`);
        try {
          await closing.disconnect();
        } catch {
          // no-op
        }
      } finally {
        client = null;
        state = 'closed';
      }
    })().finally(() => {
      closePromise = null;
    });

    return closePromise;
  };

  // The connected client, or null. Its commands give up after commandTimeoutMs, so no consumer can hang a request
  // on a stuck Redis.
  const getClient = () => (isConnected() ? withCommandTimeout(client, commandTimeoutMs) : null);

  return {
    initialize,
    close,
    getHealth,
    getClient,
    isReady: isConnected,
  };
}

const redisManager = createRedisManager();

export const initializeRedis = () => redisManager.initialize();
export const closeRedis = () => redisManager.close();
export const getRedisHealth = () => redisManager.getHealth();
export const getRedisClient = () => redisManager.getClient();
export const isRedisReady = () => redisManager.isReady();
