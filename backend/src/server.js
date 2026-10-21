import 'dotenv/config';
import http from 'http';
import { fileURLToPath } from 'url';
import app from './app.js';
import pool from './config/db.js';
import { closeRedis, initializeRedis } from './config/redis.js';
import { createGracefulShutdown } from './lifecycle/gracefulShutdown.js';

const PORT = process.env.PORT || 5000;
const FORCE_SHUTDOWN_MS = Number(process.env.FORCE_SHUTDOWN_MS) || 15_000;

export async function startServer({
  port = PORT,
  logger = console,
  createServer = http.createServer,
} = {}) {
  const server = createServer(app);

  try {
    const result = await pool.query('SELECT NOW()');
    logger.log('Database connected:', result.rows[0]);
  } catch (error) {
    logger.error('Database connection failed:', error.message);
  }

  await initializeRedis();

  await new Promise((resolve) => {
    server.listen(port, () => {
      logger.log(`Server running on port ${port}`);
      resolve();
    });
  });

  const shutdown = createGracefulShutdown({ server, logger, pgPool: pool, closeRedisClient: closeRedis });

  const handleSignal = async (signal) => {
    const forceExitTimer = setTimeout(() => {
      logger.error(`Forced shutdown after ${FORCE_SHUTDOWN_MS}ms`);
      process.exit(1);
    }, FORCE_SHUTDOWN_MS);
    forceExitTimer.unref();

    try {
      await shutdown(signal);
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error('Shutdown failed:', error?.message || error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void handleSignal('SIGINT');
  });
  process.once('SIGTERM', () => {
    void handleSignal('SIGTERM');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection:', reason);
  });

  return { server, shutdown };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error?.message || error);
    process.exit(1);
  });
}
