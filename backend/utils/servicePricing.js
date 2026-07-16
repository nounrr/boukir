const SERVICE_COST_FIELD = /(prix_achat|cout_revient)/i;

export function isServiceValue(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

/**
 * Never expose a purchase/cost value for a service product.
 *
 * Service product responses often contain nested variants and snapshots which
 * do not repeat est_service. The inherited flag intentionally applies the
 * rule to those children as well.
 */
export function forceServicePricing(payload, inheritedService = false) {
  if (payload === null || payload === undefined) return payload;

  if (Array.isArray(payload)) {
    for (const item of payload) forceServicePricing(item, inheritedService);
    return payload;
  }

  if (typeof payload !== 'object' || payload instanceof Date || Buffer.isBuffer(payload)) {
    return payload;
  }

  const isService = inheritedService || isServiceValue(payload.est_service);

  for (const [key, value] of Object.entries(payload)) {
    if (isService && SERVICE_COST_FIELD.test(key)) {
      payload[key] = 0;
      continue;
    }
    forceServicePricing(value, isService);
  }

  return payload;
}

export function enforceServicePricingResponse(_req, res, next) {
  const sendJson = res.json.bind(res);
  res.json = (body) => sendJson(forceServicePricing(body));
  next();
}

