export const WEB_PRICE_MODELS = ['gpt-5-mini', 'gpt-5', 'gpt-5.2'];

export const WEB_PRICE_CACHE_HOURS = 24;

// OpenAI standard API rates on 2026-09-29, USD per million tokens:
// https://developers.openai.com/api/docs/pricing
// Keep this estimate separate from billing; update rates when prices change.
const MODEL_TOKEN_RATES = {
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5.2': { input: 1.75, cachedInput: 0.175, output: 14 },
};

export function canReuseWebPriceResearch(row, model, now = Date.now()) {
  if (!row || row.model !== model || row.error_text) return false;
  const searchedAt = new Date(row.searched_at).getTime();
  const age = now - searchedAt;
  return Number.isFinite(age) && age >= 0 && age < WEB_PRICE_CACHE_HOURS * 60 * 60 * 1000;
}

export function summarizeWebResearchUsage(response, model) {
  if (!response?.usage) return undefined;
  const inputTokens = Math.max(0, Number(response?.usage?.input_tokens) || 0);
  const outputTokens = Math.max(0, Number(response?.usage?.output_tokens) || 0);
  const cachedInputTokens = Math.min(inputTokens, Math.max(0, Number(response?.usage?.input_tokens_details?.cached_tokens) || 0));
  const webSearchCalls = Array.isArray(response?.output)
    ? response.output.filter((item) => item?.type === 'web_search_call' && item.action?.type === 'search').length
    : 0;
  const rates = MODEL_TOKEN_RATES[model];
  const estimatedCostUsd = rates
    ? ((inputTokens - cachedInputTokens) * rates.input + cachedInputTokens * rates.cachedInput + outputTokens * rates.output) / 1_000_000 + webSearchCalls * 0.01
    : null;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    web_search_calls: webSearchCalls,
    estimated_cost_usd: estimatedCostUsd == null ? null : Math.round(estimatedCostUsd * 1_000_000_000) / 1_000_000_000,
  };
}

export function parseWebResearchUsage(value) {
  if (value == null) return undefined;
  try {
    const usage = typeof value === 'string' ? JSON.parse(value) : value;
    if (!usage || typeof usage !== 'object') return undefined;
    const cost = usage.estimated_cost_usd;
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return undefined;
    return usage;
  } catch {
    return undefined;
  }
}

export function summarizeWebPrices(raw, sourceUrls = []) {
  const allowed = new Set(sourceUrls.filter((url) => /^https?:\/\//i.test(url)));
  const offers = [];
  for (const item of Array.isArray(raw?.offers) ? raw.offers : []) {
    const price = Number(item?.price);
    const url = String(item?.url || '').trim();
    if (!Number.isFinite(price) || price <= 0 || !allowed.has(url)) continue;
    if (String(item?.currency || '').toUpperCase() !== 'MAD') continue;
    if (offers.some((offer) => offer.url === url)) continue;
    let host;
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { continue; }
    offers.push({ price: Math.round(price * 100) / 100, url, site: host, title: String(item?.title || '').slice(0, 160), ingco: host === 'ingco.com' || host.endsWith('.ingco.com') || host === 'ingco.ma' || host.endsWith('.ingco.ma') });
  }
  const group = (items) => {
    const grouped = new Map();
    for (const offer of items) {
      const key = offer.price.toFixed(2);
      const entry = grouped.get(key) || { price: offer.price, count: 0, sources: [] };
      entry.count += 1;
      entry.sources.push({ site: offer.site, url: offer.url, title: offer.title });
      grouped.set(key, entry);
    }
    return [...grouped.values()].sort((a, b) => b.count - a.count || a.price - b.price);
  };
  return { market: group(offers.filter((offer) => !offer.ingco)), ingco: group(offers.filter((offer) => offer.ingco)), offersCount: offers.length };
}
