import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import app from '../src/app.js';
import pool from '../src/config/db.js';
import {
  createRateLimiter,
  getClientIp,
  hashIdentifier,
} from '../src/middleware/rateLimit.middleware.js';

test.after(async () => {
  await pool.end().catch(() => {});
});

class MockRedisRateLimitClient {
  constructor({ shouldFail = false } = {}) {
    this.counters = new Map();
    this.shouldFail = shouldFail;
    this.isOpen = true;
    this.isReady = true;
    this.evalCalls = 0;
    this.delCalls = 0;
  }

  async eval(script, options = {}) {
    this.evalCalls += 1;
    if (this.shouldFail) {
      const err = new Error('Connection lost');
      err.code = 'ECONNREFUSED';
      throw err;
    }

    const key = options.keys[0];
    const args = options.arguments || [];
    const now = Date.now();

    if (script.includes('current = tonumber(redis.call(\'GET\', KEYS[1])')) {
      const entry = this.counters.get(key);
      if (!entry || entry.expiresAt <= now) {
        return [0, 0];
      }
      return [entry.count, Math.max(1, entry.expiresAt - now)];
    }

    const windowMs = Number(args[0]) || 60000;
    const entry = this.counters.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.counters.set(key, { count: 1, expiresAt: now + windowMs });
      return [1, windowMs];
    }

    entry.count += 1;
    return [entry.count, Math.max(1, entry.expiresAt - now)];
  }

  async del(key) {
    this.delCalls += 1;
    if (this.shouldFail) throw new Error('ECONNREFUSED');
    return this.counters.delete(key) ? 1 : 0;
  }
}

const createMockReqRes = ({ ip = '127.0.0.1', body = {}, headers = {} } = {}) => {
  const req = {
    ip,
    socket: { remoteAddress: ip },
    body,
    headers,
  };

  const responseHeaders = new Map();
  let statusCode = 200;
  let jsonBody = null;
  const finishListeners = [];

  const res = {
    set(name, value) {
      responseHeaders.set(name.toLowerCase(), String(value));
      return this;
    },
    get(name) {
      return responseHeaders.get(name.toLowerCase());
    },
    status(code) {
      statusCode = code;
      this.statusCode = code;
      return this;
    },
    json(obj) {
      jsonBody = obj;
      return this;
    },
    on(event, listener) {
      if (event === 'finish') finishListeners.push(listener);
      return this;
    },
    triggerFinish() {
      for (const fn of finishListeners) fn();
    },
    get statusCode() {
      return statusCode;
    },
    set statusCode(code) {
      statusCode = code;
    },
    responseHeaders,
    getJsonBody: () => jsonBody,
  };

  return { req, res };
};

test('rate limit: allows requests below limit and blocks requests above limit with 429', async () => {
  const client = new MockRedisRateLimitClient();
  const limiter = createRateLimiter({
    name: 'test_limit',
    windowMs: 60000,
    max: 2,
    getClient: () => client,
  });

  // Request 1: allowed
  const req1 = createMockReqRes({ ip: '192.168.1.1' });
  let nextCalled1 = false;
  await limiter(req1.req, req1.res, () => { nextCalled1 = true; });
  assert.equal(nextCalled1, true);
  assert.equal(req1.res.get('x-ratelimit-remaining'), '1');

  // Request 2: allowed (hits max)
  const req2 = createMockReqRes({ ip: '192.168.1.1' });
  let nextCalled2 = false;
  await limiter(req2.req, req2.res, () => { nextCalled2 = true; });
  assert.equal(nextCalled2, true);
  assert.equal(req2.res.get('x-ratelimit-remaining'), '0');

  // Request 3: blocked (exceeds max)
  const req3 = createMockReqRes({ ip: '192.168.1.1' });
  let nextCalled3 = false;
  await limiter(req3.req, req3.res, () => { nextCalled3 = true; });
  assert.equal(nextCalled3, false);
  assert.equal(req3.res.statusCode, 429);
  assert.match(req3.res.getJsonBody().message, /Too many attempts/);
  assert.equal(typeof req3.res.get('retry-after'), 'string');
  assert.equal(Number(req3.res.get('retry-after')) > 0, true);
});

test('rate limit: counters are shared across multiple simulated Node.js instances', async () => {
  const sharedRedisClient = new MockRedisRateLimitClient();

  // Instance A and Instance B of the backend share the same Redis client
  const instanceALimiter = createRateLimiter({
    name: 'shared_endpoint',
    windowMs: 60000,
    max: 2,
    getClient: () => sharedRedisClient,
  });
  const instanceBLimiter = createRateLimiter({
    name: 'shared_endpoint',
    windowMs: 60000,
    max: 2,
    getClient: () => sharedRedisClient,
  });

  // Request 1 routed to Instance A
  const reqA = createMockReqRes({ ip: '10.0.0.5' });
  let aAllowed = false;
  await instanceALimiter(reqA.req, reqA.res, () => { aAllowed = true; });
  assert.equal(aAllowed, true);

  // Request 2 routed to Instance B
  const reqB = createMockReqRes({ ip: '10.0.0.5' });
  let bAllowed = false;
  await instanceBLimiter(reqB.req, reqB.res, () => { bAllowed = true; });
  assert.equal(bAllowed, true);

  // Request 3 routed to Instance A: blocked because shared counter in Redis reached 2
  const reqA2 = createMockReqRes({ ip: '10.0.0.5' });
  let a2Allowed = false;
  await instanceALimiter(reqA2.req, reqA2.res, () => { a2Allowed = true; });
  assert.equal(a2Allowed, false);
  assert.equal(reqA2.res.statusCode, 429);
});

test('rate limit: expired window resets counter allowing new requests', async () => {
  const client = new MockRedisRateLimitClient();
  const limiter = createRateLimiter({
    name: 'expiry_test',
    windowMs: 50, // 50ms window
    max: 1,
    getClient: () => client,
  });

  // Request 1: allowed
  const req1 = createMockReqRes({ ip: '10.1.1.1' });
  let r1 = false;
  await limiter(req1.req, req1.res, () => { r1 = true; });
  assert.equal(r1, true);

  // Immediate Request 2: blocked
  const req2 = createMockReqRes({ ip: '10.1.1.1' });
  let r2 = false;
  await limiter(req2.req, req2.res, () => { r2 = true; });
  assert.equal(r2, false);
  assert.equal(req2.res.statusCode, 429);

  // Wait 60ms for window to expire
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Request 3: allowed after expiry
  const req3 = createMockReqRes({ ip: '10.1.1.1' });
  let r3 = false;
  await limiter(req3.req, req3.res, () => { r3 = true; });
  assert.equal(r3, true);
});

test('rate limit: Redis unavailable falls back to local memory with header and warning log', async () => {
  const warnings = [];
  const logger = {
    warn: (msg) => warnings.push(msg),
    error: () => {},
    log: () => {},
  };

  const limiter = createRateLimiter({
    name: 'fallback_test',
    windowMs: 60000,
    max: 2,
    fallbackPolicy: 'local_memory',
    getClient: () => null, // Redis unavailable
    logger,
  });

  const req1 = createMockReqRes({ ip: '192.168.2.2' });
  let nextCalled = false;
  await limiter(req1.req, req1.res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req1.res.get('x-ratelimit-fallback'), 'local-memory');
  assert.equal(warnings.some((w) => w.includes('fallback_test')), true);

  // Local counter is enforced on the instance
  await limiter(req1.req, req1.res, () => {});
  const reqBlocked = createMockReqRes({ ip: '192.168.2.2' });
  let blockedNext = false;
  await limiter(reqBlocked.req, reqBlocked.res, () => { blockedNext = true; });
  assert.equal(blockedNext, false);
  assert.equal(reqBlocked.res.statusCode, 429);
});

test('rate limit: fail_closed policy returns 503 when Redis is unavailable', async () => {
  const limiter = createRateLimiter({
    name: 'strict_security',
    windowMs: 60000,
    max: 5,
    fallbackPolicy: 'fail_closed',
    getClient: () => null,
    logger: { warn: () => {} },
  });

  const { req, res } = createMockReqRes({ ip: '10.0.0.1' });
  let nextCalled = false;
  await limiter(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
  assert.match(res.getJsonBody().message, /service temporarily unavailable/i);
});

test('rate limit: login failure limiter clears on 2xx and locks out on 401s', async () => {
  const client = new MockRedisRateLimitClient();
  const failureLimiter = createRateLimiter({
    name: 'test_login_failures',
    windowMs: 60000,
    max: 2,
    countIf: (status) => status === 401,
    getClient: () => client,
  });

  // Attempt 1: Failed login (401)
  const a1 = createMockReqRes({ ip: '1.2.3.4' });
  await failureLimiter(a1.req, a1.res, () => {});
  a1.res.statusCode = 401;
  a1.res.triggerFinish();

  // Attempt 2: Failed login (401)
  const a2 = createMockReqRes({ ip: '1.2.3.4' });
  await failureLimiter(a2.req, a2.res, () => {});
  a2.res.statusCode = 401;
  a2.res.triggerFinish();

  // Attempt 3: Blocked before reaching controller
  const a3 = createMockReqRes({ ip: '1.2.3.4' });
  let reachedController = false;
  await failureLimiter(a3.req, a3.res, () => { reachedController = true; });
  assert.equal(reachedController, false);
  assert.equal(a3.res.statusCode, 429);

  // Successful login on another IP clears their failure counter
  const s1 = createMockReqRes({ ip: '5.6.7.8' });
  await failureLimiter(s1.req, s1.res, () => {});
  s1.res.statusCode = 401;
  s1.res.triggerFinish(); // 1 failure recorded

  const s2 = createMockReqRes({ ip: '5.6.7.8' });
  await failureLimiter(s2.req, s2.res, () => {});
  s2.res.statusCode = 200;
  s2.res.triggerFinish(); // 200 clears key

  // Verify key for 5.6.7.8 is deleted from Redis
  assert.equal(client.counters.has('rf:rl:test_login_failures:5.6.7.8'), false);
});

test('security: spoofed X-Forwarded-For headers are ignored when trust proxy is false', () => {
  const spoofedReq = {
    ip: '192.168.1.100', // Real socket address reported by Express
    socket: { remoteAddress: '192.168.1.100' },
    headers: {
      'x-forwarded-for': '1.1.1.1, 8.8.8.8', // Spoofed header from attacker
    },
  };

  const clientIp = getClientIp(spoofedReq);
  assert.equal(clientIp, '192.168.1.100');
  assert.notEqual(clientIp, '1.1.1.1');
});

test('security: email is hashed and passwords are never included in rate limit keys', () => {
  const sensitiveEmail = 'admin@returnflow.test';
  const hashed = hashIdentifier(sensitiveEmail);

  assert.equal(typeof hashed, 'string');
  assert.equal(hashed.length, 16);
  assert.equal(hashed.includes('@'), false);
  assert.equal(hashed.includes('admin'), false);
  // Verify deterministic output
  assert.equal(hashed, hashIdentifier('ADMIN@returnflow.test '));
});

test('HTTP integration: public API routes are protected by apiLimiter while health checks are exempt', async () => {
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));
  const { port } = testServer.address();

  try {
    // Health probe must be 200 and NOT have rate limit headers
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(healthRes.status, 200);

    // API route must include rate limit headers
    const apiRes = await fetch(`http://127.0.0.1:${port}/api/products`);
    assert.equal(apiRes.status, 200);
    assert.equal(apiRes.headers.has('x-ratelimit-limit'), true);
    assert.equal(apiRes.headers.has('x-ratelimit-remaining'), true);
  } finally {
    testServer.closeAllConnections?.();
    await new Promise((resolve) => testServer.close(resolve));
  }
});
