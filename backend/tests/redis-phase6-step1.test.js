import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import app from '../src/app.js';
import { createRedisManager } from '../src/config/redis.js';
import { getReadinessStatus } from '../src/health/readiness.js';
import { createGracefulShutdown } from '../src/lifecycle/gracefulShutdown.js';
import { startServer } from '../src/server.js';
import pool from '../src/config/db.js';

test.after(async () => {
  await pool.end().catch(() => {});
});

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

test('startServer fails cleanly and throws when PostgreSQL connection fails', async () => {
  const logger = createLogger();
  let serverCreated = false;
  let listenCalled = false;

  const mockPgPool = {
    query: async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
    },
  };

  const mockCreateServer = () => {
    serverCreated = true;
    return {
      listen: () => {
        listenCalled = true;
      },
    };
  };

  await assert.rejects(
    startServer({
      logger,
      pgPool: mockPgPool,
      createServer: mockCreateServer,
      registerSignalHandlers: false,
    }),
    /Database connection failed: connect ECONNREFUSED/,
  );

  assert.equal(serverCreated, false);
  assert.equal(listenCalled, false);
  assert.equal(
    logger.logs.some(([level, msg]) => level === 'error' && msg.includes('Database connection failed')),
    true,
  );
});

test('startServer succeeds when PostgreSQL is healthy even if Redis is unavailable', async () => {
  const logger = createLogger();
  let serverListened = false;

  class FakeServer extends EventEmitter {
    constructor() {
      super();
      this.listening = false;
    }
    listen(port, callback) {
      this.listening = true;
      serverListened = true;
      setTimeout(callback, 2);
      return this;
    }
    close(callback) {
      this.listening = false;
      setTimeout(callback, 2);
      return this;
    }
  }

  const mockPgPool = {
    query: async () => ({ rows: [{ now: new Date().toISOString() }] }),
    end: async () => {},
  };

  const result = await startServer({
    logger,
    pgPool: mockPgPool,
    initializeRedisFn: async () => {
      throw new Error('Redis connection error');
    },
    createServer: () => new FakeServer(),
    registerSignalHandlers: false,
  });

  assert.equal(serverListened, true);
  assert.equal(typeof result.shutdown, 'function');
  await result.shutdown('test-complete');
});

test('startServer cleans up Redis if HTTP server listen fails', async () => {
  const logger = createLogger();
  let redisClosed = false;

  class FailingServer extends EventEmitter {
    listen() {
      setTimeout(() => {
        this.emit('error', new Error('EADDRINUSE: address already in use'));
      }, 5);
      return this;
    }
    close(cb) {
      cb?.();
    }
  }

  const mockPgPool = {
    query: async () => ({ rows: [{ now: '2026-10-21' }] }),
    end: async () => {},
  };

  await assert.rejects(
    startServer({
      logger,
      pgPool: mockPgPool,
      initializeRedisFn: async () => {},
      closeRedisFn: async () => {
        redisClosed = true;
      },
      createServer: () => new FailingServer(),
      registerSignalHandlers: false,
    }),
    /EADDRINUSE/,
  );

  assert.equal(redisClosed, true);
});

test('startServer signal handler runs graceful shutdown and exits with 0', async () => {
  const logger = createLogger();

  class FakeProcess extends EventEmitter {
    constructor() {
      super();
      this.exitCode = null;
    }
    exit(code) {
      this.exitCode = code;
    }
  }

  class FakeServer extends EventEmitter {
    constructor() {
      super();
      this.listening = true;
    }
    listen(port, callback) {
      setTimeout(callback, 2);
      return this;
    }
    close(callback) {
      this.listening = false;
      setTimeout(callback, 2);
      return this;
    }
  }

  const fakeProcess = new FakeProcess();
  let pgClosed = false;

  const mockPgPool = {
    query: async () => ({ rows: [{ now: '2026-10-21' }] }),
    end: async () => {
      pgClosed = true;
    },
  };

  await startServer({
    logger,
    pgPool: mockPgPool,
    initializeRedisFn: async () => {},
    closeRedisFn: async () => {},
    createServer: () => new FakeServer(),
    processRef: fakeProcess,
    registerSignalHandlers: true,
  });

  fakeProcess.emit('SIGTERM');

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(pgClosed, true);
  assert.equal(fakeProcess.exitCode, 0);
});

test('startServer signal handler forces exit with 1 on shutdown timeout', async () => {
  const logger = createLogger();

  class FakeProcess extends EventEmitter {
    constructor() {
      super();
      this.exitCode = null;
    }
    exit(code) {
      this.exitCode = code;
    }
  }

  class HangingServer extends EventEmitter {
    constructor() {
      super();
      this.listening = true;
    }
    listen(port, callback) {
      setTimeout(callback, 2);
      return this;
    }
    close() {
      // Hangs intentionally: never calls callback
    }
  }

  const fakeProcess = new FakeProcess();

  const mockPgPool = {
    query: async () => ({ rows: [{ now: '2026-10-21' }] }),
    end: async () => {
      // Hangs intentionally
      await new Promise(() => {});
    },
  };

  const { handleSignal } = await startServer({
    logger,
    pgPool: mockPgPool,
    initializeRedisFn: async () => {},
    closeRedisFn: async () => {},
    createServer: () => new HangingServer(),
    processRef: fakeProcess,
    forceShutdownMs: 25,
    registerSignalHandlers: false,
  });

  void handleSignal('SIGINT');

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(fakeProcess.exitCode, 1);
  assert.equal(
    logger.logs.some(([level, msg]) => level === 'error' && msg.includes('Forced shutdown')),
    true,
  );
});

test('HTTP /health and /health/ready endpoints work as expected', async () => {
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));
  const { port } = testServer.address();

  try {
    const livenessRes = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(livenessRes.status, 200);
    const livenessBody = await livenessRes.json();
    assert.deepEqual(livenessBody, { status: 'ok' });

    const readinessRes = await fetch(`http://127.0.0.1:${port}/health/ready`);
    assert.equal([200, 503].includes(readinessRes.status), true);
    const readinessBody = await readinessRes.json();
    assert.equal(typeof readinessBody.status, 'string');
    assert.equal(typeof readinessBody.dependencies, 'object');
    assert.equal(typeof readinessBody.dependencies.postgresql, 'object');
    assert.equal(typeof readinessBody.dependencies.redis, 'object');
    // Ensure no passwords or secrets are leaked in response
    const bodyStr = JSON.stringify(readinessBody);
    assert.equal(bodyStr.includes('password'), false);
    assert.equal(bodyStr.includes('secret'), false);
  } finally {
    await new Promise((resolve) => testServer.close(resolve));
  }
});
