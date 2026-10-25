import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../src/app.js';
import pool from '../src/config/db.js';
import { createCacheService } from '../src/services/cache.service.js';
import {
  getCatalogProducts,
  getCatalogProductById,
  invalidateCatalogCache,
  CATALOG_CACHE_KEYS,
} from '../src/services/product.service.js';

test.after(async () => {
  await pool.end().catch(() => {});
});

class MockRedisClient {
  constructor({ shouldFail = false } = {}) {
    this.storage = new Map();
    this.ttls = new Map();
    this.getCalls = 0;
    this.setCalls = 0;
    this.delCalls = 0;
    this.shouldFail = shouldFail;
    this.isOpen = true;
    this.isReady = true;
  }

  async get(key) {
    this.getCalls += 1;
    if (this.shouldFail) throw new Error('ECONNREFUSED');
    return this.storage.has(key) ? this.storage.get(key) : null;
  }

  async set(key, value, options = {}) {
    this.setCalls += 1;
    if (this.shouldFail) throw new Error('ECONNREFUSED');
    this.storage.set(key, value);
    if (options.EX) {
      this.ttls.set(key, options.EX);
    }
    return 'OK';
  }

  async del(keys) {
    this.delCalls += 1;
    if (this.shouldFail) throw new Error('ECONNREFUSED');
    const keyList = Array.isArray(keys) ? keys : [keys];
    let count = 0;
    for (const k of keyList) {
      if (this.storage.delete(k)) count += 1;
      this.ttls.delete(k);
    }
    return count;
  }
}

const createTestLogger = () => {
  const errors = [];
  return {
    errors,
    error: (...args) => errors.push(args.join(' ')),
    log: () => {},
  };
};

test('cache-aside: cache miss calls fetcher and sets key in Redis with TTL', async () => {
  const client = new MockRedisClient();
  const cache = createCacheService({ getClient: () => client, defaultTtlSeconds: 120 });
  let fetcherCalls = 0;

  const data = await cache.remember('test:key:1', 60, async () => {
    fetcherCalls += 1;
    return { id: 1, name: 'Product 1' };
  });

  assert.equal(fetcherCalls, 1);
  assert.deepEqual(data, { id: 1, name: 'Product 1' });
  assert.equal(client.storage.get('test:key:1'), JSON.stringify({ id: 1, name: 'Product 1' }));
  assert.equal(client.ttls.get('test:key:1'), 60);
});

test('cache-aside: cache hit returns data from Redis without calling fetcher', async () => {
  const client = new MockRedisClient();
  client.storage.set('test:key:hit', JSON.stringify({ id: 99, name: 'Cached Product' }));
  const cache = createCacheService({ getClient: () => client });
  let fetcherCalls = 0;

  const data = await cache.remember('test:key:hit', 60, async () => {
    fetcherCalls += 1;
    return { id: 99, name: 'From DB' };
  });

  assert.equal(fetcherCalls, 0);
  assert.deepEqual(data, { id: 99, name: 'Cached Product' });
  assert.equal(client.getCalls, 1);
  assert.equal(client.setCalls, 0);
});

test('cache-aside: respects custom TTL vs default TTL configuration', async () => {
  const client = new MockRedisClient();
  const cache = createCacheService({ getClient: () => client, defaultTtlSeconds: 300 });

  await cache.remember('key:default:ttl', async () => ({ status: 'default' }));
  assert.equal(client.ttls.get('key:default:ttl'), 300);

  await cache.remember('key:custom:ttl', 45, async () => ({ status: 'custom' }));
  assert.equal(client.ttls.get('key:custom:ttl'), 45);
});

test('cache-aside: transparent fallback to fetcher when Redis is unconfigured or unavailable', async () => {
  const cache = createCacheService({ getClient: () => null });
  let fetcherCalls = 0;

  const data = await cache.remember('test:no:redis', 60, async () => {
    fetcherCalls += 1;
    return { fromDb: true };
  });

  assert.equal(fetcherCalls, 1);
  assert.deepEqual(data, { fromDb: true });
});

test('cache-aside: Redis get/set errors fall back to fetcher without throwing', async () => {
  const failingClient = new MockRedisClient({ shouldFail: true });
  const logger = createTestLogger();
  const cache = createCacheService({ getClient: () => failingClient, logger });
  let fetcherCalls = 0;

  const data = await cache.remember('test:error:key', 60, async () => {
    fetcherCalls += 1;
    return { resilient: true };
  });

  assert.equal(fetcherCalls, 1);
  assert.deepEqual(data, { resilient: true });
  assert.equal(logger.errors.some((msg) => msg.includes('Redis cache get failed')), true);
});

test('cache invalidation: del clears specific key or multiple keys', async () => {
  const client = new MockRedisClient();
  client.storage.set('rf:catalog:all', '["item1"]');
  client.storage.set('rf:catalog:product:1', '{"id":1}');
  const cache = createCacheService({ getClient: () => client });

  const deleted = await cache.del(['rf:catalog:all', 'rf:catalog:product:1']);
  assert.equal(deleted, 2);
  assert.equal(client.storage.has('rf:catalog:all'), false);
  assert.equal(client.storage.has('rf:catalog:product:1'), false);
});

test('catalog service: getCatalogProducts caches in rf:catalog:all and invalidates on update', async () => {
  const client = new MockRedisClient();
  const cache = createCacheService({ getClient: () => client });
  let dbQueries = 0;

  const mockDbPool = {
    query: async () => {
      dbQueries += 1;
      return { rows: [{ id: 1, name: 'Phone' }, { id: 2, name: 'Headphones' }] };
    },
  };

  const firstCall = await getCatalogProducts({ cache, dbPool: mockDbPool });
  assert.equal(firstCall.length, 2);
  assert.equal(dbQueries, 1);

  // Second call must hit cache:
  const secondCall = await getCatalogProducts({ cache, dbPool: mockDbPool });
  assert.equal(secondCall.length, 2);
  assert.equal(dbQueries, 1); // Not incremented

  // Invalidate catalog:
  await invalidateCatalogCache(1, { cache });
  assert.equal(client.storage.has(CATALOG_CACHE_KEYS.all), false);

  // Third call re-fetches from database:
  await getCatalogProducts({ cache, dbPool: mockDbPool });
  assert.equal(dbQueries, 2);
});

test('catalog service: getCatalogProductById caches per ID and handles missing product', async () => {
  const client = new MockRedisClient();
  const cache = createCacheService({ getClient: () => client });
  let dbQueries = 0;

  const mockDbPool = {
    query: async (sql, params) => {
      dbQueries += 1;
      if (params[0] === 42) {
        return { rows: [{ id: 42, name: 'Special Item' }] };
      }
      return { rows: [] };
    },
  };

  const product = await getCatalogProductById(42, { cache, dbPool: mockDbPool });
  assert.equal(product.id, 42);
  assert.equal(dbQueries, 1);

  // Cached on second call:
  const cachedProduct = await getCatalogProductById(42, { cache, dbPool: mockDbPool });
  assert.equal(cachedProduct.id, 42);
  assert.equal(dbQueries, 1);

  // Non-existent product throws notFound:
  await assert.rejects(
    getCatalogProductById(9999, { cache, dbPool: mockDbPool }),
    /Product not found/,
  );
});

test('data isolation: seller-scoped keys prevent cross-user data leakage', async () => {
  const client = new MockRedisClient();
  const cache = createCacheService({ getClient: () => client });

  // Seller 101 and Seller 202 querying their products
  const seller1Products = await cache.remember('rf:seller:101:products', 60, async () => [
    { id: 1, name: 'Seller 101 Item' },
  ]);
  const seller2Products = await cache.remember('rf:seller:202:products', 60, async () => [
    { id: 2, name: 'Seller 202 Item' },
  ]);

  assert.deepEqual(seller1Products, [{ id: 1, name: 'Seller 101 Item' }]);
  assert.deepEqual(seller2Products, [{ id: 2, name: 'Seller 202 Item' }]);

  // Verify that Seller 1's cache key does not match or overwrite Seller 2's cache key
  assert.notEqual(client.storage.get('rf:seller:101:products'), client.storage.get('rf:seller:202:products'));
});

test('HTTP endpoint integration: GET /api/products returns public catalog data safely', async () => {
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, resolve));
  const { port } = testServer.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/products`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body.products), true);

    if (body.products.length > 0) {
      const sample = body.products[0];
      assert.equal('id' in sample, true);
      assert.equal('name' in sample, true);
      assert.equal('price' in sample, true);
      // Ensure no private or sensitive properties are leaked
      assert.equal('password_hash' in sample, false);
      assert.equal('password' in sample, false);
      assert.equal('token' in sample, false);
    }
  } finally {
    await new Promise((resolve) => testServer.close(resolve));
  }
});

