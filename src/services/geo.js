// src/services/geo.js

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function findNearest(lat, lng, items, count = 3) {
  return items
    .filter(item => item.lat && item.lng)
    .map(item => ({
      ...item,
      distance: haversineDistance(lat, lng, parseFloat(item.lat), parseFloat(item.lng)),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

function parseLocation(twilioBody) {
  if (twilioBody.Latitude && twilioBody.Longitude) {
    return {
      lat: parseFloat(twilioBody.Latitude),
      lng: parseFloat(twilioBody.Longitude),
    };
  }
  return null;
}

module.exports = { haversineDistance, findNearest, parseLocation };
