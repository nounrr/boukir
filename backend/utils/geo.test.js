import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultStoreLocation, haversineDistanceKm, readShippingLocation } from './geo.js';

test('the delivery point is read whatever name the client used', () => {
  const point = { lat: 35.7598, lng: -5.8339 };
  assert.deepEqual(readShippingLocation({ shipping_location: point }), point);
  assert.deepEqual(readShippingLocation({ customer_location: { latitude: '35.7598', longitude: '-5.8339' } }), point);
  assert.deepEqual(readShippingLocation({ shipping_lat: '35.7598', shipping_lng: '-5.8339' }), point);
  // The website's checkout sends these two names: they used to be ignored (no distance, no map position).
  assert.deepEqual(readShippingLocation({ shipping_latitude: 35.7598, shipping_longitude: -5.8339 }), point);
});

test('no point, or an impossible one, gives nothing', () => {
  assert.equal(readShippingLocation({}), null);
  assert.equal(readShippingLocation(undefined), null);
  assert.equal(readShippingLocation({ shipping_latitude: 135, shipping_longitude: -5.8 }), null);
  assert.equal(readShippingLocation({ shipping_location: { lat: 'x', lng: 1 } }), null);
});

test('distance from the shop is the straight line (haversine), in km', () => {
  const store = getDefaultStoreLocation();
  assert.equal(haversineDistanceKm(store, store), 0);
  const km = haversineDistanceKm(store, { lat: 35.7598, lng: -5.8339 });
  assert.ok(km > 1 && km < 1.2, `about 1.06 km, got ${km}`);
});
