// src/features/shelter.js
const cache = require('../services/cache');
const sheets = require('../services/sheets');
const { findNearest } = require('../services/geo');

const CACHE_KEY = 'shelters:all';

async function handleShelter({ zone, location }) {
  let data;
  let stale = false;
  let cachedAt = null;

  // Try cache
  const cached = await cache.getFromCache(CACHE_KEY);
  if (cached) {
    data = cached.data;
    cachedAt = cached.cachedAt;
  } else {
    // Try sheets
    try {
      data = await sheets.fetchSheet('shelters');
      await cache.setCache(CACHE_KEY, data, cache.TTL.shelters);
      cachedAt = Date.now();
    } catch {
      // Fallback to stale
      const staleData = await cache.getStaleOrNull(CACHE_KEY);
      if (staleData) {
        data = staleData.data;
        cachedAt = staleData.cachedAt;
        stale = true;
      } else {
        return { shelters: [], stale: false, error: 'network' };
      }
    }
  }

  if (data.length === 0) return { shelters: [], stale: false, error: 'sheets_empty' };

  // Filter open shelters only
  let shelters = data.filter(s => s.status === 'open');

  // Filter by zone or find nearest
  if (location) {
    shelters = findNearest(location.lat, location.lng, shelters, 3);
  } else if (zone) {
    shelters = shelters.filter(s => s.zone_normalized === zone);
  }

  return { shelters, stale, cachedAt };
}

module.exports = { handleShelter };
