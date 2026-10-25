import pool from '../config/db.js';
import { closeRedis } from '../config/redis.js';

const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS) || 10_000;

export function createGracefulShutdown({
  server,
  pgPool = pool,
  closeRedisClient = closeRedis,
  logger = console,
  shutdownGraceMs = SHUTDOWN_GRACE_MS,
} = {}) {
  let shutdownPromise = null;

  return async function shutdown(signal = 'manual') {
    if (shutdownPromise) {
      logger.log(`Shutdown already in progress (${signal})`);
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      logger.log(`Received ${signal}. Starting graceful shutdown...`);

      if (server && typeof server.close === 'function' && server.listening) {
        let timedOut = false;
        const closePromise = new Promise((resolve) => {
          server.close((error) => {
            if (error) logger.error('HTTP server close error:', error.message);
            resolve();
          });
        });

        try {
          server.closeIdleConnections?.();
        } catch {
          // ignore if unsupported
        }

        const timeoutPromise = new Promise((resolve) => {
          const timer = setTimeout(() => {
            timedOut = true;
            resolve();
          }, shutdownGraceMs);
          timer.unref?.();
        });

        await Promise.race([closePromise, timeoutPromise]);
        if (timedOut) logger.error(`Graceful shutdown timed out after ${shutdownGraceMs}ms`);
      }

      const resourceResults = await Promise.allSettled([
        typeof closeRedisClient === 'function' ? closeRedisClient() : Promise.resolve(),
        pgPool && typeof pgPool.end === 'function' ? pgPool.end() : Promise.resolve(),
      ]);

      if (resourceResults[0].status === 'rejected') {
        logger.error('Redis close error:', resourceResults[0].reason?.message || resourceResults[0].reason);
      }
      if (resourceResults[1].status === 'rejected') {
        logger.error('PostgreSQL close error:', resourceResults[1].reason?.message || resourceResults[1].reason);
      }

      logger.log('Shutdown complete');
    })();

    return shutdownPromise;
  };
}
