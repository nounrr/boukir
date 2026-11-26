import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, tripStats } from './tripStats.js';

const at = (min) => new Date(Date.UTC(2026, 10, 26, 8, 0) + min * 60000).toISOString();
// About 1.11 km per 0.01° of latitude.
const p = (min, lat, lng = -5.83, speed = null) => ({ latitude: lat, longitude: lng, vitesse_kmh: speed, recorded_at: at(min) });

test('distance between two points', () => {
  assert.ok(Math.abs(distanceKm(p(0, 35.75), p(1, 35.76)) - 1.112) < 0.01);
});

test('a day with a drive, a 20-minute stop and another drive', () => {
  const points = [
    p(0, 35.70, -5.83, 40), p(2, 35.72, -5.83, 60), p(4, 35.74, -5.83, 70),
    // Stop for 20 minutes at the same place.
    p(5, 35.745, -5.83, 0), p(15, 35.7451, -5.83, 0), p(25, 35.7452, -5.83, 0),
    p(27, 35.76, -5.83, 50), p(29, 35.78, -5.83, 55),
  ];
  const s = tripStats(points);
  assert.equal(s.points, 8);
  assert.ok(s.distance_km > 8.5 && s.distance_km < 9.5, String(s.distance_km));
  assert.equal(s.max_kmh, 70);
  assert.equal(s.stops.length, 1);
  assert.equal(s.stops[0].minutes, 20);
  assert.ok(s.driving_minutes >= 7 && s.driving_minutes <= 10, String(s.driving_minutes));
  assert.ok(s.avg_kmh > 40);
  assert.equal(s.first_at, at(0));
  assert.equal(s.last_at, at(29));
});

test('a bad fix far away is left out of the distance', () => {
  const s = tripStats([p(0, 35.70), p(1, 36.70), p(2, 35.701)]);
  assert.ok(s.distance_km < 1, String(s.distance_km));
});

test('no points or a single one', () => {
  assert.equal(tripStats([]).distance_km, 0);
  assert.equal(tripStats([p(0, 35.7)]).points, 1);
  assert.equal(tripStats([p(0, 35.7)]).stops.length, 0);
});

test('without reported speed, the top speed comes from the points', () => {
  const s = tripStats([p(0, 35.70), p(1, 35.71)]);
  assert.ok(s.max_kmh > 60 && s.max_kmh < 70, String(s.max_kmh));
});

test('a gap without signal adds no distance: the road taken is unknown', () => {
  const s = tripStats([p(0, 35.70, -5.83, 40), p(2, 35.72, -5.83, 40), p(300, 35.90, -5.83, 40), p(302, 35.92, -5.83, 40)]);
  assert.ok(s.distance_km > 4 && s.distance_km < 5, String(s.distance_km));
});
