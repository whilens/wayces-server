/**
 * Кэш каталога в Redis (categories + простой список products).
 * REDIS_ENABLED=false — работа без кэша (только БД).
 */
const { createClient } = require('redis');

const PREFIX = 'wayces:catalog:';
const TTL_CATEGORIES = parseInt(process.env.CACHE_TTL_CATEGORIES || '600', 10);
const TTL_PRODUCTS_LIST = parseInt(process.env.CACHE_TTL_PRODUCTS_LIST || '120', 10);

let client = null;
let connected = false;

function isEnabled() {
  return process.env.REDIS_ENABLED !== 'false';
}

async function connect() {
  if (!isEnabled()) {
    console.log('ℹ️ Redis отключён (REDIS_ENABLED=false)');
    return false;
  }
  if (connected && client?.isOpen) return true;

  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  client = createClient({ url });
  client.on('error', (err) => {
    console.warn('[redis]', err.message);
  });

  try {
    await client.connect();
    connected = true;
    console.log(`✅ Redis: ${url}`);
    return true;
  } catch (err) {
    console.warn('⚠️ Redis недоступен, API без кэша:', err.message);
    client = null;
    connected = false;
    return false;
  }
}

async function get(key) {
  if (!connected || !client?.isOpen) return null;
  try {
    const raw = await client.get(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[redis] get:', err.message);
    return null;
  }
}

async function set(key, value, ttlSeconds) {
  if (!connected || !client?.isOpen) return;
  try {
    await client.set(PREFIX + key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    console.warn('[redis] set:', err.message);
  }
}

const CATEGORIES_KEY = 'categories:v1';

async function getCategories() {
  return get(CATEGORIES_KEY);
}

async function setCategories(data) {
  return set(CATEGORIES_KEY, data, TTL_CATEGORIES);
}

/** Кэшируем только page/limit без фильтров (как в k6: ?limit=20) */
function productsListCacheKey(query) {
  const filterKeys = [
    'categoryId',
    'search',
    'specifications',
    'variantFilters',
    'minPrice',
    'maxPrice',
  ];
  for (const k of filterKeys) {
    if (query[k] !== undefined && query[k] !== null && String(query[k]).trim() !== '') {
      return null;
    }
  }
  const page = query.page ? String(query.page) : '1';
  const limit = query.limit ? String(query.limit) : '10';
  return `products:list:v1:p${page}:l${limit}`;
}

async function getProductsList(query) {
  const key = productsListCacheKey(query);
  if (!key) return { key: null, data: null };
  const data = await get(key);
  return { key, data };
}

async function setProductsList(query, payload) {
  const key = productsListCacheKey(query);
  if (!key) return null;
  await set(key, payload, TTL_PRODUCTS_LIST);
  return key;
}

async function invalidateCatalog() {
  if (!connected || !client?.isOpen) return;
  try {
    const keys = [];
    for await (const key of client.scanIterator({ MATCH: `${PREFIX}*`, COUNT: 100 })) {
      keys.push(key);
    }
    if (keys.length > 0) {
      await client.del(keys);
      console.log(`[redis] сброшен кэш каталога: ${keys.length} ключ(ей)`);
    }
  } catch (err) {
    console.warn('[redis] invalidate:', err.message);
  }
}

module.exports = {
  connect,
  isEnabled,
  getCategories,
  setCategories,
  getProductsList,
  setProductsList,
  productsListCacheKey,
  invalidateCatalog,
};
