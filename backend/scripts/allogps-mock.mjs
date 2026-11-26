// Faux AlloGPS pour tester en local (aucun accès réel) : node backend/scripts/allogps-mock.mjs, puis lancer le
// serveur avec ALLOGPS_BASE_URL=http://127.0.0.1:5599 (identifiants quelconques).
import http from 'node:http';

const vehicles = [
  { key: 'A100', name: 'Camion Isuzu', plate: 'TEST-GPS-1' },
  { key: 'B200', name: 'Fourgon Renault', plate: '55555-B-9' },
  { key: 'C300', name: 'Pickup', plate: '77777-H-1' },
];
const start = Date.now();
function position(key) {
  const i = vehicles.findIndex((v) => v.key === key);
  const t = (Date.now() - start) / 1000;
  const moving = i !== 2;
  const lat = 35.7595 + i * 0.01 + (moving ? t * 0.00012 : 0);
  const lng = -5.834 + (moving ? t * 0.00008 : 0);
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${now.toTimeString().slice(0, 8)}`;
  return {
    status: 'ok',
    data: {
      imei: `86${key}`,
      lat: lat.toFixed(6), lng: lng.toFixed(6),
      speed: moving ? 45 + Math.round(15 * Math.sin(t / 20)) : 0,
      angle: 35, gps_time: stamp, ignition: moving ? 1 : 0,
      odometer: 123456 + Math.round(t / 10), address: moving ? 'Route de Tétouan, Tanger' : 'Zone industrielle, Tanger',
      fuel: 62, battery: '12.7', satellites: 11, altitude: 48, motion: moving ? 'moving' : 'parked',
      sensors: { temperature: 21.5, door: 'closed' },
    },
  };
}

http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method === 'POST' && req.url === '/auth/login') return send(200, { token: 'mock-token' });
  if (req.headers.authorization !== 'Bearer mock-token') return send(401, { message: 'unauthorized' });
  if (req.url.startsWith('/list/')) return send(200, [{ agency: 'Tanger', vehicles }]);
  const m = req.url.match(/^\/gps\/(.+)$/);
  if (m && vehicles.some((v) => v.key === decodeURIComponent(m[1]))) return send(200, position(decodeURIComponent(m[1])));
  send(404, { message: 'not found' });
}).listen(5599, '127.0.0.1', () => console.log('mock AlloGPS on 5599'));
