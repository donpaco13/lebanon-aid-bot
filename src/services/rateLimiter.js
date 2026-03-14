// src/services/rateLimiter.js
const { kv } = require('@vercel/kv');

const RATE_LIMIT = 30;
const WINDOW_SECONDS = 3600; // 1 hour

async function checkRateLimit(phoneHash) {
  try {
    const key = `rate:${phoneHash}`;
    const count = await kv.get(key);

    if (count === null) {
      await kv.set(key, 1, { ex: WINDOW_SECONDS });
      return { allowed: true };
    }

    if (count >= RATE_LIMIT) {
      return { allowed: false };
    }

    await kv.set(key, count + 1, { ex: WINDOW_SECONDS });
    return { allowed: true };
  } catch {
    return { allowed: true }; // fail open — rate limiter failure must not block users
  }
}

module.exports = { checkRateLimit };
