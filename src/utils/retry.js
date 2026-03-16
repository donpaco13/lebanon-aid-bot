// src/utils/retry.js

const DEFAULT_OPTS = {
  maxAttempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 5000,
  isRetryable: () => true,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, opts = {}) {
  const { maxAttempts, baseDelayMs, maxDelayMs, isRetryable } = { ...DEFAULT_OPTS, ...opts };

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) throw err;
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      await sleep(delay);
    }
  }
  throw lastErr;
}

module.exports = { withRetry };
