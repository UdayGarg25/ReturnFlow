import 'dotenv/config';
import http from 'http';
import { fileURLToPath } from 'url';
import app from './app.js';
import pool from './config/db.js';
import { closeRedis, initializeRedis } from './config/redis.js';
import { createGracefulShutdown } from './lifecycle/gracefulShutdown.js';

const PORT = process.env.PORT || 5000;
const FORCE_SHUTDOWN_MS = Number(process.env.FORCE_SHUTDOWN_MS) || 15_000;
const DB_CONNECT_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS) || 5_000;

export async function startServer({
  port = PORT,
  logger = console,
  createServer = http.createServer,
  pgPool = pool,
  initializeRedisFn = initializeRedis,
  closeRedisFn = closeRedis,
  forceShutdownMs = FORCE_SHUTDOWN_MS,
  processRef = process,
  registerSignalHandlers = true,
} = {}) {
  // Step 1: PostgreSQL connection check is mandatory.
  // Fail startup cleanly and exit non-zero if the primary database check fails or times out.
  try {
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`PostgreSQL connection check timed out after ${DB_CONNECT_TIMEOUT_MS}ms`));
      }, DB_CONNECT_TIMEOUT_MS);
      timer.unref?.();
    });

    const result = await Promise.race([pgPool.query('SELECT NOW()'), timeoutPromise]);
    logger.log('Database connected:', result.rows?.[0] || 'ok');
  } catch (error) {
    logger.error('Database connection failed:', error.message);
    throw new Error(`Database connection failed: ${error.message}`);
  }

  // Step 2: Initialize optional Redis.
  // Startup must not fail solely because Redis is unavailable during this phase.
  let redisInitialized = false;
  try {
    await initializeRedisFn();
    redisInitialized = true;
  } catch (error) {
    logger.error('Redis initialization error:', error.message);
  }

  // Step 3: Start HTTP listener. Clean up initialized resources if server fails to start.
  let server;
  try {
    server = createServer(app);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, () => {
        server.removeListener('error', reject);
        logger.log(`Server running on port ${port}`);
        resolve();
      });
    });
  } catch (error) {
    logger.error('HTTP server startup failed:', error.message);
    if (redisInitialized) {
      await closeRedisFn().catch((err) => {
        logger.error('Error closing Redis after startup failure:', err?.message || err);
      });
    }
    throw error;
  }

  const shutdown = createGracefulShutdown({
    server,
    logger,
    pgPool,
    closeRedisClient: closeRedisFn,
  });

  const handleSignal = async (signal) => {
    const forceExitTimer = setTimeout(() => {
      logger.error(`Forced shutdown after ${forceShutdownMs}ms`);
      processRef.exit(1);
    }, forceShutdownMs);
    forceExitTimer.unref?.();

    try {
      await shutdown(signal);
      clearTimeout(forceExitTimer);
      processRef.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error('Shutdown failed:', error?.message || error);
      processRef.exit(1);
    }
  };

  if (registerSignalHandlers && processRef && typeof processRef.on === 'function') {
    processRef.on('SIGINT', () => {
      void handleSignal('SIGINT');
    });
    processRef.on('SIGTERM', () => {
      void handleSignal('SIGTERM');
    });
    processRef.on('unhandledRejection', (reason) => {
      logger.error('Unhandled promise rejection:', reason);
    });
  }

  return { server, shutdown, handleSignal };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error?.message || error);
    process.exit(1);
  });
}
