// src/features/registration.js
const cache = require('../services/cache');
const sheets = require('../services/sheets');
const responses = require('../bot/responses');

const CACHE_KEY = 'registration:steps';

async function handleRegistration() {
  let data;
  let stale = false;
  let cachedAt = null;

  const cached = await cache.getFromCache(CACHE_KEY);
  if (cached) {
    data = cached.data;
    cachedAt = cached.cachedAt;
  } else {
    try {
      data = await sheets.fetchSheet('registration');
      await cache.setCache(CACHE_KEY, data, cache.TTL.registration);
      cachedAt = Date.now();
    } catch {
      const staleData = await cache.getStaleOrNull(CACHE_KEY);
      if (staleData) {
        data = staleData.data;
        cachedAt = staleData.cachedAt;
        stale = true;
      } else {
        return { steps: [], stale: false, error: true };
      }
    }
  }

  const steps = data.map(step => responses.formatRegistrationStep(step));
  return { steps, stale, cachedAt };
}

module.exports = { handleRegistration };
