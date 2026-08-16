import { emitCashRegisterChange } from '../socket/socketServer.js';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// These APIs own every table currently used by GET /api/fond-caisse/days/:date.
// The client reloads that canonical endpoint after the signal, so operations
// excluded by the fond-caisse rules never become cash notifications.
const CASH_REGISTER_PATH_PREFIXES = [
  '/api/comptant',
  '/api/payments',
  '/api/fond-caisse',
  '/api/charges',
  '/api/bons_vehicule',
  '/api/avoirs_comptant',
];

export function notifyCashRegisterChanges(req, res, next) {
  const shouldNotify = MUTATION_METHODS.has(req.method)
    && CASH_REGISTER_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix));

  if (!shouldNotify) {
    next();
    return;
  }

  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    try {
      emitCashRegisterChange({
        method: req.method,
        path: req.path,
        actorId: req.user?.id ?? null,
        occurredAt: new Date().toISOString(),
      });
    } catch (error) {
      // A realtime notification must never make a successful cash operation fail.
      console.warn('Cash register realtime notification failed:', error?.message || error);
    }
  });

  next();
}
