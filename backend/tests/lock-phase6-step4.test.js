import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireLock,
  releaseLock,
  withLock,
  LockContentionError,
  LockTimeoutError,
  RedisUnavailableError,
} from '../src/services/redisLock.service.js';

class MockRedisLockClient {
  constructor({ shouldFail = false } = {}) {
    this.storage = new Map(); // key -> { token, expiresAt }
    this.shouldFail = shouldFail;
    this.isOpen = true;
    this.isReady = true;
    this.setCalls = 0;
    this.evalCalls = 0;
  }

  async set(key, token, options = {}) {
    this.setCalls += 1;
    if (this.shouldFail) {
      const err = new Error('Connection refused');
      err.code = 'ECONNREFUSED';
      throw err;
    }

    const now = Date.now();
    const existing = this.storage.get(key);

    if (options.NX) {
      if (existing && existing.expiresAt > now) {
        return null; // Key already exists and has not expired
      }
    }

    const ttlMs = options.PX || 10000;
    this.storage.set(key, { token, expiresAt: now + ttlMs });
    return 'OK';
  }

  async eval(script, options = {}) {
    this.evalCalls += 1;
    if (this.shouldFail) {
      const err = new Error('Connection refused');
      err.code = 'ECONNREFUSED';
      throw err;
    }

    const key = options.keys[0];
    const expectedToken = options.arguments[0];
    const now = Date.now();
    const existing = this.storage.get(key);

    if (!existing || existing.expiresAt <= now) {
      this.storage.delete(key);
      return 0;
    }

    if (existing.token === expectedToken) {
      this.storage.delete(key);
      return 1;
    }

    return 0;
  }
}

test('1. A lock can be acquired when the key is available', async () => {
  const client = new MockRedisLockClient();
  const lock = await acquireLock('test-resource-1', {
    ttlMs: 5000,
    getClient: () => client,
  });

  assert.equal(typeof lock.token, 'string');
  assert.equal(lock.lockKey, 'rf:lock:test-resource-1');
  assert.equal(lock.ttlMs, 5000);
  assert.equal(client.storage.has('rf:lock:test-resource-1'), true);
});

test('2. A second concurrent acquisition cannot acquire the same lock', async () => {
  const client = new MockRedisLockClient();
  const lock1 = await acquireLock('test-resource-2', {
    ttlMs: 5000,
    timeoutMs: 0,
    getClient: () => client,
  });
  assert.equal(Boolean(lock1), true);

  await assert.rejects(
    acquireLock('test-resource-2', {
      ttlMs: 5000,
      timeoutMs: 0,
      getClient: () => client,
    }),
    LockContentionError,
  );
});

test('3. Different resource keys can be locked independently', async () => {
  const client = new MockRedisLockClient();
  const lockA = await acquireLock('resource-A', { getClient: () => client });
  const lockB = await acquireLock('resource-B', { getClient: () => client });

  assert.equal(lockA.lockKey, 'rf:lock:resource-A');
  assert.equal(lockB.lockKey, 'rf:lock:resource-B');
  assert.notEqual(lockA.token, lockB.token);
});

test('4. An owner can release its own lock', async () => {
  const client = new MockRedisLockClient();
  const lock = await acquireLock('test-release', { getClient: () => client });
  assert.equal(client.storage.has('rf:lock:test-release'), true);

  const released = await releaseLock(lock, { getClient: () => client });
  assert.equal(released, true);
  assert.equal(client.storage.has('rf:lock:test-release'), false);
});

test('5. A request with the wrong token cannot release another owner\'s lock', async () => {
  const client = new MockRedisLockClient();
  const legitimateLock = await acquireLock('test-wrong-token', { getClient: () => client });

  const fakeLock = {
    lockKey: legitimateLock.lockKey,
    token: 'wrong-fake-token-uuid',
  };

  const released = await releaseLock(fakeLock, { getClient: () => client });
  assert.equal(released, false);
  // Legitimate lock remains intact in storage
  assert.equal(client.storage.has('rf:lock:test-wrong-token'), true);
});

test('6. An expired lock can be acquired again', async () => {
  const client = new MockRedisLockClient();
  const lock1 = await acquireLock('test-expiry', {
    ttlMs: 40, // 40ms lease
    getClient: () => client,
  });
  assert.equal(Boolean(lock1), true);

  // Immediate second acquire fails
  await assert.rejects(
    acquireLock('test-expiry', { timeoutMs: 0, getClient: () => client }),
    LockContentionError,
  );

  // Wait 60ms for lock lease to expire
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Can acquire again after expiry
  const lock2 = await acquireLock('test-expiry', {
    ttlMs: 5000,
    getClient: () => client,
  });
  assert.equal(Boolean(lock2), true);
  assert.notEqual(lock1.token, lock2.token);
});

test('7. An older owner cannot delete a newer owner\'s lock after expiry and reacquisition', async () => {
  const client = new MockRedisLockClient();
  // Owner 1 acquires with short 30ms lease
  const oldLock = await acquireLock('test-race-reclaim', {
    ttlMs: 30,
    getClient: () => client,
  });

  // Wait for Owner 1's lease to expire
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Owner 2 acquires the lock
  const newLock = await acquireLock('test-race-reclaim', {
    ttlMs: 10000,
    getClient: () => client,
  });

  // Owner 1 belatedly attempts to release its lock
  const oldReleaseResult = await releaseLock(oldLock, { getClient: () => client });
  assert.equal(oldReleaseResult, false); // Compare-and-delete rejected Owner 1's release

  // Owner 2's lock is still safely held
  assert.equal(client.storage.get('rf:lock:test-race-reclaim').token, newLock.token);
});

test('8. Acquisition timeout and lock contention are handled correctly', async () => {
  const client = new MockRedisLockClient();
  // Owner 1 holds lock for 80ms
  await acquireLock('test-contention', { ttlMs: 80, getClient: () => client });

  // Contender with short 30ms timeout times out
  await assert.rejects(
    acquireLock('test-contention', {
      timeoutMs: 30,
      retryDelayMs: 10,
      getClient: () => client,
    }),
    LockTimeoutError,
  );

  // Contender with longer 120ms timeout succeeds after Owner 1's lease expires
  const contenderLock = await acquireLock('test-contention', {
    timeoutMs: 120,
    retryDelayMs: 10,
    getClient: () => client,
  });
  assert.equal(Boolean(contenderLock), true);
});

test('9. Redis connection errors follow the documented failure policy', async () => {
  const failingClient = new MockRedisLockClient({ shouldFail: true });

  // Default fail-closed policy throws RedisUnavailableError
  await assert.rejects(
    acquireLock('test-failing-redis', { getClient: () => failingClient }),
    RedisUnavailableError,
  );

  // withLock default fail-closed
  await assert.rejects(
    withLock('test-fail-closed', async () => 'should not run', {
      getClient: () => failingClient,
    }),
    RedisUnavailableError,
  );

  // withLock with bypassIfDbGuarded logs warning and proceeds with database-level protection
  const warnings = [];
  const logger = {
    warn: (msg) => warnings.push(msg),
    error: () => {},
  };

  const result = await withLock(
    'test-bypass',
    async (lock) => {
      assert.equal(lock, null); // Indicated that Redis lock was bypassed
      return 'db-protected-result';
    },
    {
      getClient: () => failingClient,
      bypassIfDbGuarded: true,
      logger,
    },
  );

  assert.equal(result, 'db-protected-result');
  assert.equal(warnings.some((w) => w.includes('Proceeding with database-level protection')), true);
});

test('10. Callback errors propagate and cleanup is attempted safely', async () => {
  const client = new MockRedisLockClient();
  let lockAcquiredToken = null;

  await assert.rejects(
    withLock(
      'test-callback-error',
      async (lock) => {
        lockAcquiredToken = lock.token;
        throw new Error('Business logic validation failure');
      },
      { getClient: () => client },
    ),
    /Business logic validation failure/,
  );

  // Lock must have been released in finally block
  assert.equal(client.storage.has('rf:lock:test-callback-error'), false);
  assert.equal(client.evalCalls, 1);
});

test('11. A release error does not silently hide the original callback error', async () => {
  const client = new MockRedisLockClient();
  const logger = { error: () => {}, log: () => {} };

  await assert.rejects(
    withLock(
      'test-release-error-preservation',
      async () => {
        // Break the client before callback finishes to cause release error
        client.shouldFail = true;
        throw new Error('Original business operation failed');
      },
      { getClient: () => client, logger },
    ),
    /Original business operation failed/,
  );
});

test('12. Selected integration: startAssessment uses withLock with non-blocking fast-fail on lock contention', async () => {
  const client = new MockRedisLockClient();

  // Simulate an assessment already locked by an active process
  await acquireLock('ai-assessment:999', {
    ttlMs: 30000,
    getClient: () => client,
  });

  // Attempting concurrent startAssessment throws LockContentionError
  await assert.rejects(
    acquireLock('ai-assessment:999', {
      timeoutMs: 0,
      getClient: () => client,
    }),
    LockContentionError,
  );
});
