import { randomUUID } from 'node:crypto';

export const CLIENT_DETAIL_AUDIT_PREFIX = 'client-detail:';

// The source is attribution metadata; authorization still runs through the normal guards.
export function auditRequestId(headers, generateId = randomUUID) {
  if (headers['x-modification-source'] === 'client-detail') return CLIENT_DETAIL_AUDIT_PREFIX + generateId();
  const supplied = headers['x-request-id'];
  return typeof supplied === 'string' && !supplied.startsWith(CLIENT_DETAIL_AUDIT_PREFIX) ? supplied : generateId();
}
