// tests/services/geo.test.js
const { haversineDistance, findNearest, parseLocation } = require('../../src/services/geo');

describe('haversineDistance', () => {
  test('calculates distance between two points in km', () => {
    // Beirut to Sidon ~42km
    const d = haversineDistance(33.8938, 35.5018, 33.5572, 35.3729);
    expect(d).toBeGreaterThan(38);
    expect(d).toBeLessThan(45);
  });

  test('same point returns 0', () => {
    expect(haversineDistance(33.89, 35.50, 33.89, 35.50)).toBe(0);
  });
});

describe('findNearest', () => {
  const items = [
    { id: '1', lat: '33.89', lng: '35.50' }, // closest
    { id: '2', lat: '34.43', lng: '35.83' }, // far
    { id: '3', lat: '33.88', lng: '35.49' }, // second closest
  ];

  test('returns N nearest items sorted by distance', () => {
    const result = findNearest(33.89, 35.50, items, 2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('3');
    expect(result[0].distance).toBeDefined();
  });

  test('skips items without lat/lng', () => {
    const withMissing = [...items, { id: '4' }];
    const result = findNearest(33.89, 35.50, withMissing, 5);
    expect(result).toHaveLength(3);
  });
});

describe('parseLocation', () => {
  test('extracts lat/lng from Twilio location message', () => {
    const result = parseLocation({ Latitude: '33.89', Longitude: '35.50' });
    expect(result).toEqual({ lat: 33.89, lng: 35.50 });
  });

  test('returns null if no location data', () => {
    expect(parseLocation({})).toBeNull();
    expect(parseLocation({ Body: 'hello' })).toBeNull();
  });
});
