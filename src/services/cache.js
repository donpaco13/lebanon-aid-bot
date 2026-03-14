// src/services/cache.js
const { kv } = require('@vercel/kv');

// TTL values in seconds
const TTL = {
  shelters: 900,      // 15 min
  evacuations: 300,   // 5 min
  medical: 600,       // 10 min
  registration: 3600, // 1h
  zones: 3600,        // 1h
};

const STALE_TTL = 86400; // 24h — stale backup lives longer

async function getFromCache(key) {
  try {
    const cached = await kv.get(key);
    return cached || null;
  } catch {
    return null;
  }
}

async function setCache(key, data, ttlSeconds) {
  try {
    const payload = { data, cachedAt: Date.now() };
    await kv.set(key, payload, { ex: ttlSeconds });
    // Also store in stale backup with longer TTL
    await kv.set(`stale:${key}`, payload, { ex: STALE_TTL });
  } catch {
    // Cache write failure is non-fatal
  }
}

async function getStaleOrNull(key) {
  try {
    return await kv.get(`stale:${key}`) || null;
  } catch {
    return null;
  }
}

module.exports = { getFromCache, setCache, getStaleOrNull, TTL };
