// src/features/evacuation.js
const cache = require('../services/cache');
const sheets = require('../services/sheets');

const CACHE_KEY = 'evacuations:all';

async function handleEvacuation({ zone }) {
  let data;
  let stale = false;
  let cachedAt = null;

  const cached = await cache.getFromCache(CACHE_KEY);
  if (cached) {
    data = cached.data;
    cachedAt = cached.cachedAt;
  } else {
    try {
      data = await sheets.fetchSheet('evacuations');
      await cache.setCache(CACHE_KEY, data, cache.TTL.evacuations);
      cachedAt = Date.now();
    } catch {
      const staleData = await cache.getStaleOrNull(CACHE_KEY);
      if (staleData) {
        data = staleData.data;
        cachedAt = staleData.cachedAt;
        stale = true;
      } else {
        return { evacuations: [], stale: false, error: 'network' };
      }
    }
  }

  if (data.length === 0) return { evacuations: [], stale: false, error: 'sheets_empty' };

  let evacuations;
  if (zone) {
    // Return zone-specific status (active or all_clear)
    evacuations = data.filter(e => e.zone_normalized === zone);
  } else {
    // Return all active evacuations
    evacuations = data.filter(e => e.status === 'active');
  }

  return { evacuations, stale, cachedAt };
}

module.exports = { handleEvacuation };
