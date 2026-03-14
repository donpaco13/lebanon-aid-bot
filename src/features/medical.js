// src/features/medical.js
const cache = require('../services/cache');
const sheets = require('../services/sheets');
const { findNearest } = require('../services/geo');

const CACHE_KEY = 'medical:all';
const ACTIVE_STATUSES = ['operational', 'limited'];

async function handleMedical({ zone, location }) {
  let data;
  let stale = false;
  let cachedAt = null;

  const cached = await cache.getFromCache(CACHE_KEY);
  if (cached) {
    data = cached.data;
    cachedAt = cached.cachedAt;
  } else {
    try {
      data = await sheets.fetchSheet('medical');
      await cache.setCache(CACHE_KEY, data, cache.TTL.medical);
      cachedAt = Date.now();
    } catch {
      const staleData = await cache.getStaleOrNull(CACHE_KEY);
      if (staleData) {
        data = staleData.data;
        cachedAt = staleData.cachedAt;
        stale = true;
      } else {
        return { facilities: [], stale: false, error: true };
      }
    }
  }

  // Filter to active statuses only
  let facilities = data.filter(f => ACTIVE_STATUSES.includes(f.status));

  // Filter by zone or find nearest
  if (location) {
    facilities = findNearest(location.lat, location.lng, facilities, 3);
  } else if (zone) {
    facilities = facilities.filter(f => f.zone_normalized === zone);
  }

  return { facilities, stale, cachedAt };
}

module.exports = { handleMedical };
