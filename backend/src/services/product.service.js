import pool from '../config/db.js';
import { cacheService } from './cache.service.js';
import { notFound, validationError } from '../utils/http.js';

const PRODUCT_COLUMNS = 'id, name, description, price, image_url, created_at, updated_at';
export const CATALOG_CACHE_TTL_SECONDS = Number(process.env.CATALOG_CACHE_TTL_SECONDS) || 60;

export const CATALOG_CACHE_KEYS = {
  all: 'rf:catalog:all',
  product: (id) => `rf:catalog:product:${id}`,
};

export async function getCatalogProducts({ cache = cacheService, dbPool = pool } = {}) {
  return cache.remember(CATALOG_CACHE_KEYS.all, CATALOG_CACHE_TTL_SECONDS, async () => {
    const { rows } = await dbPool.query(`SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY id`);
    return rows;
  });
}

export async function getCatalogProductById(productId, { cache = cacheService, dbPool = pool } = {}) {
  const cleanId = Number(productId);
  if (!Number.isInteger(cleanId) || cleanId <= 0) {
    throw validationError('Invalid product ID');
  }

  const product = await cache.remember(CATALOG_CACHE_KEYS.product(cleanId), CATALOG_CACHE_TTL_SECONDS, async () => {
    const { rows } = await dbPool.query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`, [cleanId]);
    return rows[0] || null;
  });

  if (!product) {
    throw notFound('Product');
  }

  return product;
}

export async function invalidateCatalogCache(productId = null, { cache = cacheService } = {}) {
  const keys = [CATALOG_CACHE_KEYS.all];
  if (productId) {
    keys.push(CATALOG_CACHE_KEYS.product(productId));
  }
  return cache.del(keys);
}

