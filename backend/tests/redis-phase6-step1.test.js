import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRedisManager } from '../src/config/redis.js';
import { getReadinessStatus } from '../src/health/readiness.js';
import { createGracefulShutdown } from '../src/lifecycle/gracefulShutdown.js';

const createLogger = () => {
  const logs = [];
  return {
    logs,
    log: (...args) => logs.push(['log', args.join(' ')]),
    error: (...args) => logs.push(['error', args.join(' ')]),
  };
};

class FakeRedisClient extends EventEmitter {
  constructor({ connectError = null } = {}) {
    super();
    this.connectError = connectError;
    this.isOpen = false;
    this.isReady = false;
    this.quitCalls = 0;
  }

  async connect() {
    if (this.connectError) throw this.connectError;
    this.isOpen = true;
    this.isReady = true;
    this.emit('ready');
  }

  async quit() {
    this.quitCalls += 1;
    this.isOpen = false;
    this.isReady = false;
    this.emit('end');
  }

  disconnect() {
    this.isOpen = false;
    this.isReady = false;
    this.emit('end');
  }
}

test('redis manager does nothing when REDIS_URL is missing', async () => {
  let createClientCalls = 0;
  const logger = createLogger();
  const manager = createRedisManager({
    env: { REDIS_URL: '   ' },
    logger,
    createClientFn: () => {
      createClientCalls += 1;
      return new FakeRedisClient();
    },
  });

  const initHealth = await manager.initialize();
  assert.equal(createClientCalls, 0);
  assert.equal(initHealth.configured, false);
  assert.equal(initHealth.status, 'not_configured');
  assert.equal(initHealth.connected, false);

  await manager.close();
  const healthAfterClose = manager.getHealth();
  assert.equal(healthAfterClose.status, 'not_configured');
});

test('redis manager reports healthy state on successful connection', async () => {
  const logger = createLogger();
  const fakeClient = new FakeRedisClient();

  const manager = createRedisManager({
    env: { REDIS_URL: 'redis://localhost:6379' },
    logger,
    createClientFn: () => fakeClient,
  });

  const health = await manager.initialize();
  assert.equal(health.configured, true);
  assert.equal(health.connected, true);
  assert.equal(health.status, 'up');
  assert.equal(health.state, 'ready');

  await manager.close();
  assert.equal(fakeClient.quitCalls, 1);
  const closedHealth = manager.getHealth();
  assert.equal(closedHealth.connected, false);
  assert.equal(closedHealth.state, 'closed');
});

test('redis manager reports unavailable when configured but connect fails', async () => {
  const logger = createLogger();
  const connectError = Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
  const manager = createRedisManager({
    env: { REDIS_URL: 'redis://localhost:6379' },
    logger,
    createClientFn: () => new FakeRedisClient({ connectError }),
  });

  const health = await manager.initialize();
  assert.equal(health.configured, true);
  assert.equal(health.connected, false);
  assert.equal(health.status, 'down');
  assert.equal(health.state, 'unavailable');
  assert.equal(health.lastErrorCode, 'ECONNREFUSED');
  assert.equal(
    logger.logs.some(([level, msg]) => level === 'error' && msg.includes('Continuing without Redis')),
    true,
  );
});

test('readiness reports PostgreSQL and Redis dependency states separately', async () => {
  const dbUp = await getReadinessStatus({
    dbPool: { query: async () => ({ rows: [{ '?column?': 1 }] }) },
    redisHealthProvider: () => ({ configured: false, connected: false, state: 'not_configured', lastErrorCode: null }),
  });
  assert.equal(dbUp.httpStatus, 200);
  assert.equal(dbUp.body.status, 'degraded');
  assert.deepEqual(dbUp.body.dependencies.postgresql, { status: 'up' });
  assert.equal(dbUp.body.dependencies.redis.status, 'not_configured');

  const dbDown = await getReadinessStatus({
    dbPool: { query: async () => { throw new Error('db down'); } },
    redisHealthProvider: () => ({ configured: true, connected: true, state: 'ready', lastErrorCode: null }),
  });
  assert.equal(dbDown.httpStatus, 503);
  assert.equal(dbDown.body.status, 'error');
  assert.equal(dbDown.body.dependencies.postgresql.status, 'down');

  const allHealthy = await getReadinessStatus({
    dbPool: { query: async () => ({ rows: [{ '?column?': 1 }] }) },
    redisHealthProvider: () => ({ configured: true, connected: true, state: 'ready', lastErrorCode: null }),
  });
  assert.equal(allHealthy.httpStatus, 200);
  assert.equal(allHealthy.body.status, 'ok');
  assert.equal(allHealthy.body.dependencies.redis.status, 'up');
});

test('graceful shutdown is idempotent and closes server then resources', async () => {
  const logger = createLogger();
  const calls = [];

  const server = {
    listening: true,
    close(callback) {
      calls.push('server.close');
      setTimeout(() => {
        this.listening = false;
        callback();
      }, 5);
    },
  };

  const shutdown = createGracefulShutdown({
    server,
    logger,
    shutdownGraceMs: 100,
    closeRedisClient: async () => {
      calls.push('redis.close');
    },
    pgPool: {
      end: async () => {
        calls.push('pg.end');
      },
    },
  });

  await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

  assert.deepEqual(calls, ['server.close', 'redis.close', 'pg.end']);
  assert.equal(
    logger.logs.some(([level, msg]) => level === 'log' && msg.includes('Shutdown already in progress')),
    true,
  );
});

test('graceful shutdown handles close errors and timeout without throwing', async () => {
  const logger = createLogger();
  const calls = [];

  const server = {
    listening: true,
    close(callback) {
      calls.push('server.close');
      // Never resolves to exercise timeout path.
      void callback;
    },
  };

  const shutdown = createGracefulShutdown({
    server,
    logger,
    shutdownGraceMs: 20,
    closeRedisClient: async () => {
      throw new Error('redis close failed');
    },
    pgPool: {
      end: async () => {
        throw new Error('pg end failed');
      },
    },
  });

  await shutdown('SIGTERM');

  assert.deepEqual(calls, ['server.close']);
  assert.equal(
    logger.logs.some(([level, msg]) => level === 'error' && msg.includes('timed out')),
    true,
  );
  assert.equal(
    logger.logs.some(([level, msg]) => level === 'error' && msg.includes('Redis close error')),
    true,
  );
  assert.equal(
    logger.logs.some(([level, msg]) => level === 'error' && msg.includes('PostgreSQL close error')),
    true,
  );
});
